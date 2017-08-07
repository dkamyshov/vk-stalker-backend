const jprequest = require('../helpers/jprequest.js');
const buildURI = require("../helpers/uri.js");
const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl, VK) {
    return async function(req, res) {
        let connection;

        try {
            connection = await mongodb.connect(mongourl);

            const userInfo = (await jprequest(buildURI(
                VK.users_get_uri,
                {
                    user_ids: req.body.id,
                    v: VK.api_version
                }
            ))).response;

            if(userInfo.length > 0) {
                const user = userInfo[0];

                const colUsers = connection.collection('users');

                const same = await colUsers.find({ id: parseInt(user.id), owner: req.jwt.payload.user_id }).toArray();

                if(same.length > 0) {
                    sendAndClose(res, connection, {
                        status: true
                    });
                } else {
                    await colUsers.insert({
                        id: user.id,
                        name: user.first_name + ' ' + user.last_name,
                        owner: req.jwt.payload.user_id
                    });

                    sendAndClose(res, connection, {
                        status: true
                    })
                }
            } else {
                throw new Error('unexpected error fetching user...');
            }
        } catch(e) {
            console.error("[ERROR /api/users.get]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};