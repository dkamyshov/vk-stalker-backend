const fix = n => Math.round(n * 10000) / 10000;

const intervalBuilder = (records, from, to) => {
    const total = to-from,
          firstRecord = records[0];

    if(records.length == 0) {
        return [ { offset: 0, width: 1, status: 3, start: from, end: to } ];
    }

    const intervals = [{
        offset: 0,
        status: firstRecord.t > from ? 3 : firstRecord.s,
        start: from,
    }], noFirst = firstRecord.t > from;

    for(let i = noFirst ? 0 : 1; i < records.length; ++i) {
        const currentRecord = records[i], prevRecord = records[i-1];

        let lastInterval = intervals[intervals.length-1];

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
    const lastInterval = intervals[intervals.length-1];
    
    lastInterval.end = new Date(Math.min(to.getTime(), Date.now()));
    lastInterval.width = fix((lastInterval.end - lastInterval.start) / total);

    return intervals;
}

module.exports = intervalBuilder;
