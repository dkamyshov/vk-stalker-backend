const $intervalQuery = (uid, start, end) => [
    { $match: { $and: [
        { id: uid },
        { t: { $gte: start } },
        { t: { $lt: end } }
    ] } },
    { $sort: { t: 1 } },
    { $project: { _id: 0, t: 1, s: 1, id: 1 } }
];

const $lastRecordsQuery = (uid, start) => [
    { $match: { $and: [
        { id: uid },
        { t: { $lt: start } }
    ] } },
    { $sort: { t: -1 } },
    { $group: {
        _id: '$id',
        t: { $first: '$t' },
        s: { $first: '$s' }
    } }
];

const $findUsersQuery = () => [
    { $match: { $and: [ { balance: { $gt: 0 } }, { pause: false } ] } },
    { $lookup: {
        from: 'users',
        localField: 'id',
        foreignField: 'owner',
        as: 'users' } },
    { $unwind: '$users' },
    { $group: {
        _id: '$users.id',
        owners: { $push: '$id' }
    } }
];

const $fetchLastRecordsQuery = uids => [
    { $match: { id: { $in: uids } } },
    { $sort: { t: -1 } },
    { $group: {
        _id: '$id',
        t: { $first: '$t' },
        s: { $first: '$s' }
    } }
];

module.exports = {
    $intervalQuery,
    $lastRecordsQuery,
    $findUsersQuery,
    $fetchLastRecordsQuery
};