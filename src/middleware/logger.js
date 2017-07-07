module.exports = function(mongodb, mongourl) {
    return function(req, res, next) {
        var options = {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        };

        let _db;

        mongodb.connect(mongourl)
        .then(db => {
            _db = db;

            return db.collection('access').insert({
                time: Date.now(),
                readable: (new Date()).toLocaleString("ru", options),
                ip: req.connection.remoteAddress,
                path: req.url,
                user_id: req.jwt.verified ? req.jwt.payload.user_id : '-1'
            });
        }).then(() => {
            _db.close();
        }).catch(() => {
            _db.close();
        });

        next();
    };
}