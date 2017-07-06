module.exports = function() {
    return function(req, res) {
        res.send({ status: req.jwt.verified });
        res.end();
    };
};
