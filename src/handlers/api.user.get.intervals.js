const intervalBuilder = require('../helpers/intervalBuilder.js');
const { $intervalQuery, $lastRecordsQuery } = require('../helpers/queries.js');
const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl, icount, ilength, bo) {
    return async function(req, res) {
        let connection;

        const offset = req.body.offset ? new Date(parseInt(req.body.offset)) : new Date();
        const base = new Date(new Date(offset.getFullYear(), offset.getMonth(), offset.getDate()).getTime()-bo);

        const timeIntervals = Array.from({ length: icount }, (v, i) => ({
            start: new Date(base.getTime() + i*ilength),
            end:  new Date(base.getTime() + (i+1)*ilength)
        }));

        try {
            connection = await mongodb.connect(mongourl);

            const colUsers = connection.collection('users'),
                  colRecords = connection.collection('records');

            const users = await colUsers.find({ id: parseInt(req.body.userId)/*, owner: req.jwt.payload.user_id */}).toArray();

            if(users.length > 0) {
                const {id, name} = users[0];

                const [records, lastRecords] = await Promise.all([
                    Promise.all(
                        timeIntervals.map(({start, end}) => (
                            colRecords.aggregate($intervalQuery(id, start, end)).toArray()
                        ))
                    ),
                    Promise.all(
                        timeIntervals.map(({start, end}) => (
                            colRecords.aggregate($lastRecordsQuery(id, start)).toArray()
                        ))
                    )
                ]);

                const intervals = timeIntervals.map(({start, end}, i) => ({
                    offset: start,
                    intervals: intervalBuilder(
                        lastRecords[i].concat(records[i]),
                        start,
                        end
                    )
                })).sort((b, a) => a.offset - b.offset);

                sendAndClose(res, connection, {
                    status: true,
                    info: { id, name, intervals }
                });
            } else {
                throw new Error('nonexistent');
            }
        } catch(e) {
            console.error("[ERROR /api/user.intervals.get]", e.message);

            sendAndClose(res, connection, {
                status: false,
                error: e.message
            })
        }
    };
};