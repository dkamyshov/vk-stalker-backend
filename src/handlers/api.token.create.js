const jwt = require('../helpers/jwt.js');
const jprequest = require('../helpers/jprequest.js');
const buildURI = require("../helpers/uri.js");
const { jwt_secret } = require("../secrets.js");
const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl, VK) {
    return async function(req, res) {
        let connection;

        try {
            const {users, owner_id} = req.body; // TODO: DO NOT TRUST USER ON THIS!!!

            if(users.length < 1) {
                throw new Error('no users selected');
            }

            connection = await mongodb.connect(mongourl);

            const colUsers = connection.collection('users'),
                    colSettings = connection.collection('settings');

            await colUsers.remove({ owner: owner_id });
            const [accounts] = await Promise.all([
                colSettings.find({ id: owner_id }),
                colUsers.insertMany(
                    users.map(user => ({
                        id: user.id,
                        name: user.name,
                        owner: owner_id
                    }))
                )
            ]);

            if(accounts.length < 1) {
                await colSettings.insert({
                    id: owner_id,
                    balance: 10000000,
                    pause: false
                });
            }

            sendAndClose(res, connection, {
                status: true,
                token: jwt.create({
                    user_id: owner_id,
                    admin: owner_id == VK.admin_id
                }, jwt_secret)
            });
        } catch(e) {
            console.log("[ERROR /api/token.create]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
