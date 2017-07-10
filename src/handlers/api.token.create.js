const jwt = require('../helpers/jwt.js');
const jprequest = require('../helpers/jprequest.js');
const buildURI = require("../helpers/uri.js");
const { jwt_secret } = require("../secrets.js");
const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl, VK) {
    return async function(req, res) {
        let connection;

        try {
            const authResponse = await jprequest(buildURI(
                VK.access_token_uri,
                {
                    client_id: VK.app_id,
                    client_secret: VK.secret_key,
                    redirect_uri: VK.redirect_uri,
                    code: req.body.code,
                    v: VK.api_version
                }
            ));

            if(authResponse.hasOwnProperty('access_token')) {
                const owner_id = authResponse['user_id'];

                const friendsResponse = await jprequest(buildURI(
                    VK.friends_get_uri,
                    {
                        access_token: authResponse['access_token'],
                        order: 'hints',
                        fields: ['first_name', 'last_name'].join(','),
                        v: VK.api_version
                    }
                ));

                connection = await mongodb.connect(mongourl);

                const colUsers = connection.collection('users'),
                      colSettings = connection.collection('settings');

                await colUsers.remove({ owner: owner_id });
                const [accounts] = await Promise.all([
                    colSettings.find({ id: owner_id }),
                    colUsers.insertMany(
                        friendsResponse.response.items.map(item => ({
                            id: item.id,
                            name: item.first_name + ' ' + item.last_name,
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
            } else {
                throw new Error('Unable to authorize.');
            }
        } catch(e) {
            console.log("[ERROR /api/token.create]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
