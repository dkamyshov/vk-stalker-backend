const intervalBuilder = require('./intervalBuilder');

function dailyIntervalBuilder(records) {
    const nowDate = new Date();
    const intLengthHours = 24;
    const base = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 24);

    let hourly = [];

    for(let i = 0; i < 7; ++i) {
        hourly.push({
            offset: base.getTime() - intLengthHours*i*3600*1000 - intLengthHours*3600*1000,
            
            intervals: intervalBuilder(
                records,
                base.getTime() - intLengthHours*i*3600*1000 - intLengthHours*3600*1000,
                base.getTime() - intLengthHours*i*3600*1000
            )
        });
    }

    return hourly;
}

module.exports = dailyIntervalBuilder;