const {$userStats} = require('../helpers/queries.js');
const sendAndClose = require('../helpers/sendAndClose.js');

const hide = str => '*'.repeat(3) + String(str).substring(3);

module.exports = function(mongodb, mongourl) {
    return async function(req, res) {
        let connection;

        try {
            connection = await mongodb.connect(mongourl);

            const [recordsCount, users, accounts, log] = await Promise.all([
                connection.collection('records').count(),
                connection.collection('users').distinct('id'),
                connection.collection('users').aggregate($userStats()).toArray(),
                connection.collection('access').find({}).sort({ time: -1 }).limit(500).toArray()
            ]);

            sendAndClose(res, connection, {
                recordsCount,
                log,
                status: true,
                usersCount: users.length,
                accounts: accounts.map(account => Object.assign(account, {
                    id: hide(account.id)
                }))
            });
        } catch(e) {
            console.error("[ERROR /api/stats.get]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            });
        }
    };
};
