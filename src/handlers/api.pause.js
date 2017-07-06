module.exports = function(mongodb, mongourl) {
    return function(req, res) {
        let _db;

        mongodb.connect(mongourl)
        .then(db => {
            return (_db = db).collection('settings').update({id: req.jwt.payload.user_id}, {
                $set: { pause: req.body.pause }
            });
        })
        .then(() => {
            res.send({
                status: true,
                paused: req.body.pause
            });
            res.end();
        })
        .catch(e => {
            console.error("[ERROR /api/pause]", e.message);

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
