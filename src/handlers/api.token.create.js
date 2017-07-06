module.exports = function(mongodb, mongourl, VK) {
    return function(req, res) {
        let owner_id = -1, mdb;

        jprequest(buildURI(
            VK.access_token_uri,
            {
                client_id: VK.app_id,
                client_secret: VK.secret_key,
                redirect_uri: VK.redirect_uri,
                code: req.body.code,
                v: VK.api_version
            }
        )).then(response => {
            if(response.hasOwnProperty('access_token')) {
                owner_id = response['user_id'];

                return jprequest(buildURI(
                    VK.friends_get_uri,
                    {
                        access_token: response['access_token'],
                        order: 'hints',
                        fields: ['first_name', 'last_name'].join(','),
                        v: VK.api_version
                    }
                ));
            } else {
                throw new Error('Unable to authorize.');
            }
        }).then(response => {
            return mongodb.connect(mongourl).then(db => {
                return (mdb = db).collection('users').remove({owner: owner_id});
            }).then(result => {
                return mdb.collection('users').insertMany(response.response.items.map(user => ({
                    id: user.id,
                    name: user.first_name + ' ' + user.last_name,
                    owner: owner_id
                })));
            }).then(result => {
                return mdb.collection('settings').find({id: owner_id}).toArray();
            }).then(result => {
                if(result.length > 0) {
                    return Promise.resolve('good');
                } else {
                    return mdb.collection('settings').insert({
                        id: owner_id,
                        balance: 10000000,
                        pause: false
                    });
                }
            });
        }).then(result => {
            res.send({
                status: true,
                token: jwt.create({
                    user_id: owner_id,
                    admin: owner_id == admin_id
                }, jwt_secret)
            });
            res.end();
        }).catch(e => {
            console.log("[ERROR /api/token.create]", e.message);

            res.send({
                status: false,
                error: e.message
            });
            res.end();
            if(mdb) mdb.close();
        });
    };
};
