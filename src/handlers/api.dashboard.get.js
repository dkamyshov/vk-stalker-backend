const intervalBuilder = require("../helpers/intervalBuilder.js");

const NEGATIVE_BALANCE_OR_PAUSED = 'NEGATIVE_BALANCE_OR_PAUSED';

const fetchAccountAndUsers = (db, req, res) => {
    return function(accounts) {
        if(accounts.length > 0) {
            if(accounts[0].balance > 0 && !accounts[0].pause) {
                return Promise.all([
                    Promise.resolve(accounts[0]),
                    db().collection('users').find({owner: req.jwt.payload.user_id}, {_id: 0, id: 1, name: 1}).toArray()
                ]);
            } else {
                res.send({ status: true, balance: accounts[0].balance, paused: accounts[0].pause });
                res.end();
                throw new Error(NEGATIVE_BALANCE_OR_PAUSED);
            }
        } else {
            throw new Error('no such user');
        }
    };
};

const fetchRecords = (db, intervalStart, intervalEnd) => {
    return function([account, users]) {
        return Promise.all([
            Promise.resolve(account),
            Promise.resolve(users),
            db().collection('records').aggregate([
                { $match: { $and: [
                    { id: { $in: users.map(user => user.id) } },
                    { t: { $gte: intervalStart - 60000 } },
                    { t: { $lt: intervalEnd } }
                ] } },
                { $sort: { t: 1 } },
                { $project: { _id: 0, t: 1, s: 1, id: 1 } }
            ]).toArray()
        ]);
    };
};

const buildIntervalsAndSend = (res, intervalStart, intervalEnd) => {
    return function([account, users, records]) {
        res.send({
            status: true,
            balance: account.balance,
            paused: account.pause,
            users: users.map(user => Object.assign(user, {
                intervals: intervalBuilder(
                    records.filter(record => record.id == user.id),
                    intervalStart,
                    intervalEnd
                )
            }))
        });
        res.end();
    };
};

module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        const getDb = () => _db;

        const intervalEnd = Date.now();
        const intervalStart = intervalEnd - 60000*60*3;

        mongodb.connect(mongourl)
        .then(db => (_db = db).collection('settings').find({id: req.jwt.payload.user_id}).toArray())
        .then(fetchAccountAndUsers(getDb, req, res))
        .then(fetchRecords(getDb, intervalStart, intervalEnd))
        .then(buildIntervalsAndSend(res, intervalStart, intervalEnd))
        .catch(e => (e.message == NEGATIVE_BALANCE_OR_PAUSED) ? Promise.resolve() : Promise.reject(e))
        .catch(e => {
            console.error("[ERROR /api/dashboard.get]", e.message);

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
    };
};
