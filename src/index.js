const { vk_secret, listen_address, listen_port, users_per_batch, batch_delay, gmongouri } = require("./secrets.js");

const VK = {
    admin_id: 21768456,
    app_id: 6098516,
    secret_key: vk_secret,
    api_version: '5.56',

    redirect_uri: `http://vkstalker-1.appspot.com/verify`,
    
    auth_uri: 'https://oauth.vk.com/authorize',
    access_token_uri: 'https://oauth.vk.com/access_token',
    friends_get_uri: 'https://api.vk.com/method/friends.get',
    users_get_uri: 'https://api.vk.com/method/users.get'
};

const path = require("path");
const parser = require("body-parser");
const compression = require('compression');
const express = require("express");
const jwt = require("./helpers/jwt.js");
const buildURI = require("./helpers/uri.js");
const jprequest = require('./helpers/jprequest.js');
const {$findUsersQuery, $fetchLastRecordsQuery} = require('./helpers/queries.js');

const rejectUnauthorized = require('./middleware/unauthorized.js');

const mongodb = require('mongodb').MongoClient;
const mongourl = process.env.PORT ? gmongouri : "mongodb://localhost:27017/vkwatcher";

const logger = require('./middleware/logger.js')(mongodb, mongourl);

let app = express();

app.use(require('./middleware/jwt.js'));
app.use(compression());
app.use(parser.json());
app.use(express.static("./static"));
app.use(function(req, res, next) {
    res.setHeader('Connection', 'close');
    next();
});

app.post(
    '/api/prefetch',
    logger,
    require('./handlers/api.prefetch.js')(mongodb, mongourl, VK)
);

app.post(
    '/api/stats.get',
    logger,
    rejectUnauthorized,
    require('./handlers/api.stats.get.js')(mongodb, mongourl)
);

app.post(
    '/api/token.verify',
    logger,
    require('./handlers/api.token.verify.js')()
);

app.post(
    '/api/dashboard.get',
    logger,
    rejectUnauthorized,
    require('./handlers/api.dashboard.get.js')(mongodb, mongourl)
);

app.post(
    '/api/users.get',
    logger,
    rejectUnauthorized,
    require('./handlers/api.users.get')(mongodb, mongourl)
);

app.post(
    '/api/pause',
    logger,
    rejectUnauthorized,
    require('./handlers/api.pause.js')(mongodb, mongourl)
);

app.post(
    '/api/user.get',
    logger,
    rejectUnauthorized,
    require('./handlers/api.user.get.intervals.js')(mongodb, mongourl, true)
);

app.post(
    '/api/user.add',
    logger,
    rejectUnauthorized,
    require('./handlers/api.user.add.js')(mongodb, mongourl, VK)
);

app.post(
    '/api/user.hourly.get',
    logger,
    rejectUnauthorized,
    require('./handlers/api.user.get.intervals.js')(mongodb, mongourl, false)
)

app.post(
    '/api/token.create',
    logger,
    require('./handlers/api.token.create.js')(mongodb, mongourl, VK)
);

app.get('*', function(req, res) {
    res.sendFile(path.join(__dirname, "../static/index.html"));
});

async function updateBalances(balances) {
    let connection;

    try {
        connection = await mongodb.connect(mongourl);
        const colSettings = connection.collection('settings');
        await Promise.all(
            Object.keys(balances).map(uid => (
                colSettings.update({
                    id: parseInt(uid)
                }, {
                    $inc: { balance: -balances[uid] }
                })
            ))
        );
        connection.close();
    } catch(e) {
        console.log("[ERROR (update balances)]", e.message);
        connection.close();
    }
}

async function updateRecords() {
    let connection, subtractBalance = Object.create(null), recordsToInsert = [];

    try {
        connection = await mongodb.connect(mongourl);

        const colSettings = connection.collection('settings'),
              colRecords = connection.collection('records');

        const users = await colSettings.aggregate($findUsersQuery()).toArray();
        const lastRecords = await colRecords.aggregate($fetchLastRecordsQuery(users.map(({_id}) => _id))).toArray();

        let batches = [];

        for(let i = 0, n = users.length; i < n; ++i) {
            const bucketId = Math.floor(i / users_per_batch);
            batches[bucketId] = Object.assign(batches[bucketId] || {}, {
                [users[i]._id]: {
                    owners: users[i].owners,
                    lastRecord: lastRecords.find(({_id}) => _id == parseInt(users[i]._id))
                }
            })
        }

        let updated = 0, skipped = 0;

        await Promise.all(
            batches.map((batch, i) => new Promise(function(resolve, reject) {
                setTimeout(async function() {
                    const vkResponse = (await jprequest(buildURI(
                        VK.users_get_uri,
                        { user_ids: Object.keys(batch).join(','),
                            fields: 'online,last_seen',
                            v: VK.api_version }
                    ))).response;

                    const now = new Date();

                    for(let i = 0, n = vkResponse.length; i < n; ++i) {
                        const user = vkResponse[i],
                              status = user.online ? user.last_seen.platform : 0,
                              lastRecord = batch[user.id].lastRecord,
                              owners = batch[user.id].owners;

                        for(let j = 0, m = owners.length; j < m; ++j) {
                            const owner = owners[j];
                            subtractBalance[owner] = (subtractBalance[owner] || 0) + 1;
                        }

                        if(!lastRecord || lastRecord.s != status) {
                            ++updated;
                            recordsToInsert.push({ id: user.id, t: now, s: status });
                        } else {
                            ++skipped;
                        }
                    }

                    resolve();
                }, i*batch_delay);
            }))
        );

        await colRecords.insertMany(recordsToInsert);

        console.log(`Updated: ${recordsToInsert.length}, skipped: ${skipped}`);
        updateBalances(subtractBalance);
        connection.close();
    } catch(e) {
        console.error("[ERROR (update routine)]", e.message);
        updateBalances(subtractBalance);
        connection.close();
    }
}

setInterval(updateRecords, process.env.PORT ? 60000 : 20*60000);
updateRecords();

const PORT = process.env.PORT || 8080;

app.listen(PORT);
