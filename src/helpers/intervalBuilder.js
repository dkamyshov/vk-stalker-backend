const fix = n => Math.round(n * 10000) / 10000;

const intervalBuilder = (records, from, to, intervalLength = 60000, intervalDelay = 120000) => {
    const total = to-from,
          firstRecord = records[0];

    if(records.length == 0) {
        return {
            offset: 0, width: 1,
            status: 3,
            start: from, end: to,
        };
    }

    let intervals = [{
        offset: 0,
        status: firstRecord.t > from ? 3 : firstRecord.s,
        start: from,
    }], noFirst = firstRecord.t > from;

    for(let i = noFirst ? 0 : 1; i < records.length; ++i) {
        const currentRecord = records[i], prevRecord = records[i-1];

        let lastInterval = intervals[intervals.length-1];

        if(prevRecord && currentRecord.t > prevRecord.t + intervalDelay) {
            lastInterval.end = prevRecord.t + intervalLength;
            lastInterval.width = fix((lastInterval.end - lastInterval.start) / total);

            intervals.push({
                offset: fix((lastInterval.end - from) / total),
                status: 3,
                start: lastInterval.end,
                end: currentRecord.t,
                width: fix((currentRecord.t - lastInterval.end) / total),
            });

            intervals.push({
                offset: fix((currentRecord.t - from) / total),
                status: currentRecord.s,
                start: currentRecord.t,
            });

            continue;
        }

        if(currentRecord.s != lastInterval.status) {
            lastInterval.end = currentRecord.t;
            lastInterval.width = fix((lastInterval.end - lastInterval.start) / total);

            intervals.push({
                offset: fix((currentRecord.t - from) / total),
                status: currentRecord.s,
                start: currentRecord.t,
            });
        }
    }

    const lastRecord = records.pop();
    let lastInterval = intervals[intervals.length-1];
    lastInterval.end = to <= lastRecord.t+intervalLength ? to : lastRecord.t+intervalLength;
    lastInterval.width = fix((lastInterval.end - lastInterval.start) / total);

    if(to > lastRecord.t+intervalLength) {
        intervals.push({
            offset: fix((lastRecord.t + intervalLength - from) / total),
            status: 3,
            start: lastRecord.t + intervalLength,
            end: to,
            width: fix((to - lastRecord.t - intervalLength) / total),
        });
    }

    return intervals;
}

module.exports = intervalBuilder;
