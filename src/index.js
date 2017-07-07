const { vk_secret, listen_address, listen_port } = require("./secrets.js");

const VK = {
    admin_id: 21768456,
    app_id: 6098516,
    secret_key: vk_secret,
    api_version: '5.56',

    redirect_uri: `http://${listen_address}:${listen_port}/verify`,
    
    auth_uri: 'https://oauth.vk.com/authorize',
    access_token_uri: 'https://oauth.vk.com/access_token',
    friends_get_uri: 'https://api.vk.com/method/friends.get',
    users_get_uri: 'https://api.vk.com/method/users.get'
};

const path = require("path");
const parser = require("body-parser");
const compression = require('compression');
const express = require("express");
let mongodb = require('mongodb').MongoClient;

const jwt = require("./helpers/jwt.js");
const buildURI = require("./helpers/uri.js");
const jprequest = require('./helpers/jprequest.js');

const mongourl = "mongodb://localhost:27017/vkwatcher";

const logger = require('./middleware/logger.js')(mongodb, mongourl);
const rejectUnauthorized = require('./middleware/unauthorized.js');

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
    require('./handlers/api.user.get.js')(mongodb, mongourl)
);

app.post(
    '/api/token.create',
    logger,
    require('./handlers/api.token.create.js')(mongodb, mongourl, VK)
);

app.get('*', function(req, res) {
    res.sendFile(path.join(__dirname, "../static/index.html"));
});

const updateBalances = balances => {
    let mdb;

    mongodb.connect(mongourl).then(db => {
        mdb = db;

        const balancesCount = Object.keys(balances).length;
        let runningQueries = balancesCount,
            settings = db.collection('settings');

        return Promise.all(
            Object.keys(balances).map(uid => {
                return settings.update({
                    id: parseInt(uid)
                }, {
                    $inc: {
                        balance: -Math.floor(balances[uid])
                    }
                });
            })
        );
    }).then(results => {
        mdb.close();
    }).catch(e => {
        mdb.close();
    });
}

setInterval(function() {
    let _db, subtractBalance = Object.create(null);

    const $query = [
        { $match: { $and: [ { pause: false }, { balance: { $gt: 0 } } ] } },
        { $lookup : {
            from: 'users',
            localField: 'id',
            foreignField: 'owner',
            as: 'users'
        } },
        { $unwind: '$users' },
        { $group: {
            _id: '$users.id',
            owners: { $push: '$id' }
        } }
    ];

    mongodb.connect(mongourl)
    .then(db => (_db = db).collection('settings').aggregate($query).toArray())
    .then(list => {
        let batches = [];

        list.map((user, i) => {
            const bucketId = Math.floor(i/250);
            
            batches[bucketId] = Object.assign(batches[bucketId] || {}, { [user._id]: user.owners });
        });

        return Promise.all(
            batches.map((batch, i) => {
                return new Promise(function(resolve, reject) {
                    setTimeout(function() {
                        jprequest(buildURI(
                            VK.users_get_uri,
                            { user_ids: Object.keys(batch).join(','),
                              fields: 'online',
                              v: VK.api_version }
                        ))
                        .then(response => {
                            const now = Date.now();

                            _db.collection('records').insertMany(
                                response.response.map(user => {
                                    batch[user.id].map(owner => {
                                        subtractBalance[owner] = (subtractBalance[owner] || 0) + 1;
                                    })

                                    return {
                                        id: user.id,
                                        t: now,
                                        s: user.online_mobile ? 2 : user.online
                                    };
                                })
                            )
                            .then(() => {
                                resolve();
                            })
                            .catch(() => {
                                reject();
                            })
                        })
                    }, i*500);
                });
            })
        );
    })
    .then(results => {
        _db.close();
    })
    .catch(e => {
        console.error(e);
        _db.close();
    })
    .then(() => {
        updateBalances(subtractBalance);
    });
}, 60000);

app.listen(listen_port, listen_address);
