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
const intervalBuilder = require('./helpers/intervalBuilder.js');

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
    '/api/user.hourly.get',
    logger,
    rejectUnauthorized,
    function(req, res) {
        let _db;

        const offset = new Date(parseInt(req.body.offset));

        const hour = 3600*1000;
        const nowDate = new Date();
        const base = new Date(offset.getFullYear(), offset.getMonth(), offset.getDate());

        let intervals = [];

        for(let i = 0; i < 24; ++i) {
            intervals.push({
                start: new Date(base.getTime() + i*hour),
                end:  new Date(base.getTime() + (i+1)*hour)
            });
        }

        mongodb.connect(mongourl)
        .then(db => (_db = db).collection('users').find({ id: parseInt(req.body.userId) }).toArray())
        .then(users => {
            if(users.length > 0) {
                return Promise.all([
                    Promise.resolve(users[0]),
                    new Promise(function(resolve, reject) {
                        let hours = [];

                        Promise.all(
                            intervals.map((iv, i) => new Promise(function(resolve, reject) {
                                _db.collection('records').aggregate([
                                    { $match: { $and: [
                                        { id: users[0].id },
                                        { t: { $gte: iv.start } },
                                        { t: { $lt: iv.end } }
                                    ] } },
                                    { $sort: { t: 1 } },
                                    { $project: { _id: 0, t: 1, s: 1, id: 1 } }
                                ]).toArray().then(records => {
                                    _db.collection('records').aggregate([
                                        { $match: { $and: [
                                            { id: users[0].id },
                                            { t: { $lt: iv.start } }
                                        ] } },
                                        { $sort: { t: -1 } },
                                        { $group: {
                                            _id: '$id',
                                            t: { $first: '$t' },
                                            s: { $first: '$s' }
                                        } }
                                    ]).toArray().then(lastRecords => {
                                        hours.push({
                                            offset: iv.start,
                                            intervals: intervalBuilder(
                                                lastRecords.concat(records),
                                                iv.start,
                                                iv.end
                                            )
                                        });

                                        resolve();
                                    })
                                })
                            }))
                        ).then(() => {
                            resolve(hours);
                        })
                    })
                ]);
            } else {
                throw new Error('nonexistent');
            }
        })
        .then(([user, hours]) => {
            res.send({
                status: true,
                rows: hours.sort((a, b) => b.offset.getTime()-a.offset.getTime())
            });
            res.end();
        })
        .catch(e => {
            console.error("[ERROR /api/user.get]", e.message);

            if(!res.finished) {
                res.send({
                    status: false,
                    error: e.message
                });
                res.end();
            }
        })
        .then(() => {
            _db.close();
        });
    }
)

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

function updateRecords() {
    let _db, subtractBalance = Object.create(null), recordsToInsert = [];

    let ne = 0, cs = 0, sk = 0;

    const $findUsersQuery = () => [
        { $match: { $and: [ { balance: { $gt: 0 } }, { pause: false } ] } },
        { $lookup: {
            from: 'users',
            localField: 'id',
            foreignField: 'owner',
            as: 'users' } },
        { $unwind: '$users' },
        { $group: {
            _id: '$users.id',
            owners: { $push: '$id' }
        } }
    ];

    const $fetchLastRecordsQuery = uids => [
        { $match: { id: { $in: uids } } },
        { $sort: { t: -1 } },
        { $group: {
            _id: '$id',
            t: { $first: '$t' },
            s: { $first: '$s' }
        } }
    ];

    mongodb.connect(mongourl)
    .then(db => (_db = db).collection('settings').aggregate($findUsersQuery()).toArray())
    .then(users => Promise.all([
        Promise.resolve(users),
        _db.collection('records').aggregate($fetchLastRecordsQuery(users.map(user => parseInt(user._id)))).toArray()
    ]))
    .then(([users, lastRecords]) => {
        let batches = [];
        
        users.map((user, i) => {
            const bucketId = Math.floor(i / 250);

            batches[bucketId] = Object.assign(batches[bucketId] || {}, {
                [user._id]: {
                    owners: user.owners,
                    lastRecord: lastRecords.find(record => record._id == parseInt(user._id))
                }
            });
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
                            const now = new Date();

                            response.response.map(user => {
                                const status = user.online_mobile ? 2 : user.online;
                                const user_id = parseInt(user.id);
                                const lastRecord = batch[user_id].lastRecord;

                                batch[user_id].owners.map(owner => {
                                    subtractBalance[owner] = (subtractBalance[owner] || 0) + 1;
                                });

                                if(!lastRecord) {
                                    ne++;
                                    recordsToInsert.push({
                                        id: user_id,
                                        t: now, s: status
                                    });
                                } else {
                                    if(lastRecord.s != status) {
                                        cs++;
                                        recordsToInsert.push({
                                            id: user_id,
                                            t: now, s: status
                                        });
                                    } else {
                                        sk++;
                                    }
                                }
                            })
                        })
                        .then(() => {
                            resolve();
                        })
                        .catch(() => {
                            reject();
                        })
                    }, i*500);
                });
            })
        );
    }).then(() => {
        console.log(`Non-existent: ${ne}, skip: ${sk}, updates: ${cs}`);

        if(recordsToInsert.length > 0) {
            return _db.collection('records').insertMany(recordsToInsert);
        } else {
            return Promise.resolve();
        }
    })
    .catch(e => {
        console.error(e);
    })
    .then(() => {
        _db.close();
        updateBalances(subtractBalance);
    });
}

setInterval(updateRecords, 60000);

updateRecords();

app.listen(listen_port, listen_address);
