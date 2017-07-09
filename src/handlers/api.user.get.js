const intervalBuilder = require('../helpers/intervalBuilder.js');

module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        const day = 24*3600*1000;
        const nowDate = new Date();
        const base = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

        let intervals = [];

        for(let i = 0; i < 7; ++i) {
            intervals.push({
                start: new Date(base.getTime() - i*day),
                end: new Date(base.getTime() - (i-1)*day)
            });
        }

        mongodb.connect(mongourl)
        .then(db => (_db = db).collection('users').find({ id: parseInt(req.body.userId) }).toArray())
        .then(users => {
            if(users.length > 0) {
                return Promise.all([
                    Promise.resolve(users[0]),
                    new Promise(function(resolve, reject) {
                        let days = [];

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
                                        days.push({
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
                            resolve(days);
                        })
                    })
                ]);
            } else {
                throw new Error('nonexistent');
            }
        })
        .then(([user, days]) => {
            res.send({
                status: true,
                info: {
                    id: user.id,
                    name: user.name,
                    intervals: days.sort((a, b) => b.offset - a.offset)
                }
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
    };
};
