const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl) {
    return async function(req, res) {
        let connection;

        try {
            connection = await mongodb.connect(mongourl);
            const accounts = await connection.collection('settings').find({ id: req.jwt.payload.user_id }).toArray();

            if(accounts.length > 0) {
                sendAndClose(res, connection, {
                    status: true,
                    balance: accounts[0].balance,
                    paused: accounts[0].pause
                });
            } else {
                throw new Error('no such user');
            }
        } catch(e) {
            console.error("[ERROR /api/dashboard.get]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
