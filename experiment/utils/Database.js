const knex = require('knex');

module.exports = function (database) {
    var promise = new Promise((resolve, reject) => {
        var timeoutId;
        var db_conn = knex({
            client: database.type,
            connection: database[database.type],
            pool: {
                "min": 0,
                "max": 10000,
                "createTimeoutMillis": 3000,
                "acquireTimeoutMillis": 30000,
                "idleTimeoutMillis": 30000,
                "reapIntervalMillis": 1000,
                "createRetryIntervalMillis": 100,
                "propagateCreateError": false //
            }
        });
        var ping = function () {
            clearTimeout(timeoutId);
            db_conn.raw('select 1').then(function () {
                resolve({
                    knex: db_conn
                });
            }).catch((err) => {
                console.log(err);
                console.log('database is not running...');
                timeoutId = setTimeout(ping, 1000);
            })
        }
        ping();
    })

    return promise;
}