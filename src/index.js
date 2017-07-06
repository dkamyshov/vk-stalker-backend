const admin_id = 21768456;

const { vk_secret, jwt_secret, listen_address } = require("./secrets.js");

const VK = {
    app_id: 6098516,
    secret_key: vk_secret,
    api_version: '5.56',

    redirect_uri: 'http://37.98.162.168:9000/verify',
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
    rejectUnauthorized,
    require('./handlers/api.stats.get.js')(mongodb, mongourl)
);

app.post(
    '/api/token.verify',
    require('./handlers/api.token.verify.js')()
);

app.post(
    '/api/dashboard.get',
    rejectUnauthorized,
    require('./handlers/api.dashboard.get.js')(mongodb, mongourl)
);

app.post(
    '/api/pause',
    rejectUnauthorized,
    require('./handlers/api.pause.js')(mongodb, mongourl)
);

app.post(
    '/api/user.get',
    rejectUnauthorized,
    require('./handlers/api.user.get.js')(mongodb, mongourl)
);

app.post(
    '/api/token.create',
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
        mdb.collection('journal').insert({
            time: Date.now(),
            payload: `Balances updated.`
        });
        mdb.close();
    }).catch(e => {
        mdb.collection('journal').insert({
            time: Date.now(),
            payload: `Failed to update balances: ${e.message}`
        });
        mdb.close();
    });
}

setInterval(function() {
    let mdb, subtractBalance = Object.create(null);

    mongodb.connect(mongourl).then(db => {
        return (mdb = db).collection('settings').aggregate([
            { $lookup: {
                from: 'users',
                localField: 'id',
                foreignField: 'owner',
                as: 'users'
            } }, 
            { $project: { _id: 0, id: 1, pause: 1, balance: 1, users: 1 } }
        ]).toArray();
    }).then(list => {
        let uids = Object.create(null);

        list.map(user => {
            subtractBalance[user.id] = 0;

            if(!user.pause && user.balance >= user.users.length) {
                user.users.map(user2 => {
                    uids[user2.id] = uids[user2.id] ? [...uids[user2.id], user.id] : [user.id];
                })
            }
        });

        const uidsArray = Object.keys(uids).map(k => k);

        let batches = [];

        for(let i = 0; i < uidsArray.length/250; ++i) {
            batches.push(uidsArray.slice(i*250, i*250+250));
        }

        mdb.collection('journal').insert({
            time: Date.now(),
            payload: `${list.length} accounts, ${uidsArray.length} users, ${batches.length} batches.`
        });

        let batchesGoing = batches.length;

        for(let i = 0; i < batches.length; ++i) {
            (function(batch, index) {
                setTimeout(function() {
                    jprequest(buildURI(
                        VK.users_get_uri,
                        {
                            user_ids: batch.join(','),
                            fields: 'online',
                            v: VK.api_version
                        }
                    )).then(response => {
                        const now = Date.now();
                        mdb.collection('records').insertMany(
                            response.response.map(user => {
                                const owners = uids[user.id];
                                owners.map(owner => {
                                    subtractBalance[owner] += 1;
                                });

                                return {
                                    id: user.id,
                                    t: now,
                                    s: user.online_mobile ? 2 : user.online
                                };
                            })
                        ).then(result => {
                            if(--batchesGoing == 0) {
                                mdb.collection('journal').insert({
                                    time: Date.now(),
                                    payload: `Done all batches.`
                                });
                                updateBalances(subtractBalance);
                                mdb.close();
                            }
                        }).catch(e => {
                            mdb.collection('journal').insert({
                                time: Date.now(),
                                payload: `Batch error: ${e.message}.`
                            });
                            if(--batchesGoing == 0) {
                                updateBalances(subtractBalance);
                                mdb.close();
                            }
                        });
                    }).catch(e => {
                        mdb.collection('journal').insert({
                            time: Date.now(),
                            payload: `Batch error: ${e.message}.`
                        });
                        if(--batchesGoing == 0) {
                            updateBalances(subtractBalance);
                            mdb.close();
                        }
                    });
                }, 500*index);
            })(batches[i], i);
        }
    })
    .catch(e => {
        console.error(e);
        mdb.collection('journal').insert({
            time: Date.now(),
            payload: `DB connection error: ${e.message}.`
        });
        mdb.close();
    });
}, 60000);

app.listen(9000, listen_address);
