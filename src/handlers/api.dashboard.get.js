module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        mongodb.connect(mongourl)
        .then(db => (_db = db).collection('settings').find({ id: req.jwt.payload.user_id }).toArray())
        .then(accounts => {
            if(accounts.length > 0) {
                res.send({
                    status: true,
                    balance: accounts[0].balance,
                    paused: accounts[0].pause
                });
            } else {
                throw new Error('no such account');
            }
        })
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
        })
    };
};
