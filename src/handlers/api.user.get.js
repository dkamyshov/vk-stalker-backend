module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        mongodb.connect(mongourl)
        .then(db => Promise.all([
            (_db = db).collection('users').find({id: parseInt(req.body.userId)}).toArray(),
            db.collection('records').aggregate([
                { $match: { id: 121550492 } },
                { $group: { _id: '$id', count: { $sum: 1 } } }
            ]).toArray()
        ]))
        .then(([users, recordsInfo]) => {
            if(users.length > 0) {
                res.send({
                    status: true,
                    info: {
                        name: users[0].name,
                        count: recordsInfo[0].count
                    }
                });
                res.end();
            } else {
                throw new Error('user does not exist');
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
