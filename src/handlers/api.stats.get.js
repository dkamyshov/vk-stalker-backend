const hide = str => '*'.repeat(3) + String(str).substring(3);

module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let mdb;

        mongodb.connect(mongourl)
        .then(db => {
            mdb = db;

            return Promise.all([
                db.collection('records').count(),
                db.collection('users').distinct('id'),
                db.collection('users').aggregate([
                    { $group: { _id: '$owner', users: { $push: '$id' } } },
                    { $lookup: {
                            from: 'settings',
                            localField: '_id',
                            foreignField: 'id',
                            as: 'settings'
                    } },
                    { $unwind: '$settings' },
                    { $project: { _id: 0, id: '$_id', users: 1, settings: { balance: 1, pause: 1 } } }
                ]).toArray(),
                db.collection('access').find({}).sort({ time: -1 }).limit(500).toArray()
            ]);
        })
        .then(([recordsCount, usersCount, accounts, log]) => {
            res.send({
                status: 'ok',
                recordsCount,
                usersCount: usersCount.length,
                accounts: accounts.map(account => Object.assign(account, {
                    id: hide(account.id)
                })),
                log
            });
            res.end();
            mdb.close();
        })
        .catch(e => {
            console.error("[ERROR /api/stats.get]", e.message);

            res.send({
                status: 'fail',
                error: e.message
            });
            res.end();
            mdb.close();
        });
    };
};
