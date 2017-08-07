const intervalBuilder = require('../helpers/intervalBuilder.js');
const { $intervalQuery, $lastRecordsQuery } = require('../helpers/queries.js');
const sendAndClose = require('../helpers/sendAndClose.js');

module.exports = function(mongodb, mongourl, daysOrHours) {
    return async function(req, res) {
        let connection;

        let timeIntervals;
        const tz = req.body.timezone * 60000;

        if(daysOrHours) {
            const ctz = new Date(Date.now() - tz);

            const base = new Date(new Date(ctz.getFullYear(), ctz.getMonth(), ctz.getDate()).getTime() - 13*24*3600000);

            timeIntervals = Array.from({ length: 14 }, (v, i) => ({
                start: new Date(base.getTime() + i*24*3600000 + tz),
                end: new Date(base.getTime() + (i+1)*24*3600000 + tz)
            }));
        } else {
            const ctz = new Date(req.body.offset - tz);

            const base = new Date(ctz.getFullYear(), ctz.getMonth(), ctz.getDate());

            timeIntervals = Array.from({ length: 24 }, (v, i) => ({
                start: new Date(base.getTime() + i*3600000 + tz),
                end: new Date(base.getTime() + (i+1)*3600000 + tz)
            }));
        }

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

                const platforms = await colRecords.aggregate([
                    { $match: { id: parseInt(req.body.userId) } },
                    {
                        $group: {
                            _id: '$s',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } }
                ]).toArray();

                sendAndClose(res, connection, {
                    status: true,
                    info: { id, name, intervals, platforms }
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