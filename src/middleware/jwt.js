const jwt = require('../helpers/jwt.js');
const { jwt_secret } = require("../secrets.js");

module.exports = function(req, res, next) {
    try {
        const token = req.get('Authorization').split(' ')[1];

        req.jwt = {
            payload: jwt.parse(token),
            verified: jwt.verify(token, jwt_secret)
        };
    } catch(e) {
        req.jwt = {
            payload: null,
            verified: false
        };
    }

    next();
};
