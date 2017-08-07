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

                const colUsers = connection.collection('users');

                const registeredUsers = (await colUsers.aggregate([
                    { $match: { owner: owner_id } },
                    { $project: { _id: 0, id: 1, name: 1 } }
                ]).toArray());

                const allUsers = [];

                for(let i = 0; i < friendsResponse.response.items.length; ++i) {
                    const cu = friendsResponse.response.items[i];

                    if(!allUsers.find(user => user.id == cu.id)) {
                        cu.name = cu.first_name + ' ' + cu.last_name;
                        allUsers.push(cu);
                    }
                }

                for(let i = 0; i < registeredUsers.length; ++i) {
                    const cu = registeredUsers[i];

                    if(!allUsers.find(user => user.id == cu.id)) {
                        allUsers.push(cu);
                    }
                }

                sendAndClose(res, null, {
                    status: true,
                    user_id: owner_id,
                    users: allUsers.map(user => ({
                        name: user.name,
                        id: user.id,
                        selected: !!registeredUsers.find(ru => user.id == ru.id)
                    }))
                });
            } else {
                throw new Error('Unable to authorize.');
            }
        } catch(e) {
            console.log("[ERROR /api/prefetch]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
