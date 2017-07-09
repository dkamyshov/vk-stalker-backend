module.exports = function(mongodb, mongourl) {
    return function(req, res, next) {
        let _db;

        mongodb.connect(mongourl)
        .then(db => {
            _db = db;

            return db.collection('access').insert({
                time: new Date(),
                ip: req.connection.remoteAddress,
                path: req.url,
                user_id: req.jwt.verified ? req.jwt.payload.user_id : '---'
            });
        }).then(() => {
            _db.close();
        }).catch((e) => {
            console.log('logger error', e.message);
            _db.close();
        });

        next();
    };
}