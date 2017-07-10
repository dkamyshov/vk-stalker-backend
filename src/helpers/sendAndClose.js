module.exports = function(res, connection, payload) {
    try {
        if(!res.finished) {
            res.send(payload);
            res.end();
        }
        connection.close();
    } catch(e) {}
}
