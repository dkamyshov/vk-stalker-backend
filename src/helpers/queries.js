const $intervalQuery = (uid, start, end) => [
    { $match: { $and: [
        { id: uid },
        { t: { $gte: start } },
        { t: { $lt: end } }
    ] } },
    { $sort: { t: 1 } },
    { $project: { _id: 0, t: 1, s: 1, id: 1 } }
];

const $intervalQueryMulti = (uids, start, end) => [
    { $match: { $and: [
        { id: { $in: uids } },
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

const $lastRecordsQueryMulti = (uids, start) => [
    { $match: { $and: [
        { id: { $in: uids } },
        { t: { $lt: start } }
    ] } },
    { $sort: { t: -1 } },
    { $group: {
        _id: '$id',
        id: { $first: '$id' },
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

const $userStats = () => [
    { $group: { _id: '$owner', users: { $push: '$id' } } },
    { $lookup: {
            from: 'settings',
            localField: '_id',
            foreignField: 'id',
            as: 'settings'
    } },
    { $unwind: '$settings' },
    { $project: { _id: 0, id: '$_id', users: 1, settings: { balance: 1, pause: 1 } } }
];

module.exports = {
    $intervalQuery,
    $intervalQueryMulti,
    $lastRecordsQuery,
    $lastRecordsQueryMulti,
    $findUsersQuery,
    $fetchLastRecordsQuery,
    $userStats
};