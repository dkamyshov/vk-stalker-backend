const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl) {
    return async function(req, res) {
        let connection;

        try {
            connection = await mongodb.connect(mongourl);

            await connection.collection('settings').update({ id: req.jwt.payload.user_id }, {
                $set: { pause: req.body.paused }
            });

            sendAndClose(res, connection, {
                status: true,
                paused: req.body.paused
            });
        } catch(e) {
            console.error("[ERROR /api/pause]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
