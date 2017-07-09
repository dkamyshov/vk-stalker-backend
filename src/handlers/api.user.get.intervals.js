const intervalBuilder = require('../helpers/intervalBuilder.js');
const { $intervalQuery, $lastRecordsQuery } = require('../helpers/queries.js');

const sendData = (res) => ([user, ints]) => {
    res.send({
        status: true,
        info: {
            id: user.id,
            name: user.name,
            intervals: ints.sort((a, b) => b.offset.getTime()-a.offset.getTime())
        }
    });

    res.end();
};

module.exports = function(mongodb, mongourl, icount, ilength, bo) {
    return function(req, res) {
        let _db, intervals = [];

        const offset = req.body.offset ? new Date(parseInt(req.body.offset)) : new Date();
        const base = new Date(new Date(offset.getFullYear(), offset.getMonth(), offset.getDate()).getTime()-bo);

        for(let i = 0; i < icount; ++i) {
            intervals.push({
                start: new Date(base.getTime() + i*ilength),
                end:  new Date(base.getTime() + (i+1)*ilength)
            });
        }

        mongodb.connect(mongourl)
        .then(db => (_db = db).collection('users').find({ id: parseInt(req.body.userId) }).toArray())
        .then(users => {
            if(users.length > 0) {
                const user = users[0];

                return Promise.all([
                    Promise.resolve(user),
                    new Promise(function(resolve, reject) {
                        let ints = [];
                        Promise.all(
                            intervals.map(iv => new Promise(async function(resolve, reject) {
                                const records = await _db
                                                      .collection('records')
                                                      .aggregate($intervalQuery(user.id, iv.start, iv.end))
                                                      .toArray();

                                const lastRecords = await _db
                                                          .collection('records')
                                                          .aggregate($lastRecordsQuery(user.id, iv.start))
                                                          .toArray();

                                ints.push({
                                    offset: iv.start,
                                    intervals: intervalBuilder(
                                        lastRecords.concat(records),
                                        iv.start,
                                        iv.end
                                    )
                                });

                                resolve();
                            }))
                        )
                        .then(() => {
                            resolve(ints);
                        });
                    })
                ]);
            } else {
                throw new Error('nonexistent');
            }
        })
        .then(sendData(res))
        .catch(e => {
            console.error("[ERROR /api/user.get]", e.message);

            if(!res.finished) {
                res.send({
                    status: false,
                    error: e.message
                });
                res.end();
            }
        })
        .then(() => {
            _db.close();
        });
    };
};