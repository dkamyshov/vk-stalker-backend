module.exports = function(req, res, next) {
    if(!req.jwt.verified) {
        res.send({ status: false, error: 'unauthorized' });
        res.end();
        return;
    }

    next();
};
