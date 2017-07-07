const dailyIntervalBuilder = require('../helpers/dailyIntervalBuilder.js');

module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        mongodb.connect(mongourl)
        .then(db => Promise.all([
            (_db = db).collection('users').find({id: parseInt(req.body.userId)}).toArray(),
            db.collection('records').aggregate([
                { $match: { id: parseInt(req.body.userId) } },
                { $group: { _id: '$id', count: { $sum: 1 } } }
            ]).toArray(),
            db.collection('records').aggregate([
                { $match: { id: parseInt(req.body.userId) } },
                { $sort: { t: 1 } },
                { $limit: 7*24*60 },
                { $project: {id: 1, t: 1, s: 1} }
            ]).toArray()
        ]))
        .then(([users, recordsInfo, records]) => {
            if(users.length > 0) {
                res.send({
                    status: true,
                    info: {
                        id: users[0].id,
                        name: users[0].name,
                        count: recordsInfo[0] ? recordsInfo[0].count : 0,
                        intervals: dailyIntervalBuilder(records)
                    }
                });
                res.end();
            } else {
                throw new Error('nonexistent');
            }
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
