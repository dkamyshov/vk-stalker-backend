const request = require('request');

const jprequest = (url) => new Promise(function(resolve, reject) {
    request(url, function(err, rr, body) {
        if(err) reject("Error performing jprequest.");

        try {
            if(rr.statusCode == 200) {
                resolve(JSON.parse(body));
            } else {
                throw new Error("Status code "+rr.statusCode);
            }
        } catch(e) {
            reject(e);
        }
    });
});

module.exports = jprequest;
