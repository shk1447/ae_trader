const knex = require('knex');

class DataConnector {
  constructor() {
    this.connected = false;
  }

  async connect(database) {
    this.dao = await new Promise((resolve, reject) => {
      var timeoutId;
      var db_conn = knex({
        client: database.type,
        connection: database[database.type],
        pool: { min: 0, max: 10 }
      });
      var ping = () => {
        clearTimeout(timeoutId);
        db_conn.raw('select 1').then((a) => {
          console.log(a)
          this.connected = true
          this.database = db_conn;
          resolve(require('./dao'));
        }).catch((err) => {
          console.log(err);
          console.log('database is not running...');
          timeoutId = setTimeout(ping, 1000);
        })
      }
      ping();
    })
  }

  initialize() {
    if (!this.connected) return;
    // console.log(this.database)
    _.each(this.dao, (dataObj, i) => {
      var obj = new dataObj(this.database);
      obj.create().then(async () => {
        console.log('created table : ', obj.table_name);
        await obj.initialize();
      })
    })
  }
}


module.exports = new DataConnector();