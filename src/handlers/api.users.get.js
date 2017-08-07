const intervalBuilder = require("../helpers/intervalBuilder.js");
const sendAndClose = require('../helpers/sendAndClose.js');
const {$intervalQueryMulti, $lastRecordsQueryMulti} = require('../helpers/queries.js');

module.exports = function(mongodb, mongourl) {
    return async function(req, res) {
        let connection;

        const end = new Date();
        const start = new Date(end.getTime() - 3*60000*60);

        try {
            connection = await mongodb.connect(mongourl);

            const colSettings = connection.collection('settings'),
                  colUsers = connection.collection('users'),
                  colRecords = connection.collection('records');

            const accounts = await colSettings.find({id: req.jwt.payload.user_id}).toArray();

            if(accounts.length > 0) {
                const account = accounts[0];

                if(account.balance > 0 && !account.pause) {
                    const users = await colUsers.find(
                        { owner: req.jwt.payload.user_id },
                        { _id: 0, id: 1, name: 1 }
                    ).toArray();
                    
                    const records = [].concat.apply([], await Promise.all([
                        colRecords.aggregate($lastRecordsQueryMulti(users.map(user=>user.id), start)).toArray(),
                        colRecords.aggregate($intervalQueryMulti(users.map(user=>user.id), start, end)).toArray(),
                    ]));

                    sendAndClose(res, connection, {
                        status: true,
                        users: users.map(user => Object.assign(user, {
                            intervals: intervalBuilder(
                                records.filter(record => record.id == user.id),
                                start,
                                end
                            )
                        }))
                    });
                } else {
                    sendAndClose(res, connection, {
                        status: true,
                        balance: account.balance,
                        paused: account.pause
                    });
                }
            } else {
                throw new Error('no such user');
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