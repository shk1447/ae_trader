const knex = require("knex");

class DataConnector {
  constructor() {
    this.connected = false;
    this.dao = {};
    this.types = {};
  }

  async connect(database) {
    this.types = await new Promise((resolve, reject) => {
      var timeoutId;
      var db_conn = knex({
        client: database.type,
        connection: database[database.type],
        pool: { min: 0, max: 10 },
        useNullAsDefault: true,
      });
      var ping = () => {
        clearTimeout(timeoutId);
        db_conn
          .raw("select 1")
          .then((a) => {
            this.connected = true;
            this.database = db_conn;
            resolve(require("./dao"));
          })
          .catch((err) => {
            console.log(err);
            console.log("database is not running...");
            timeoutId = setTimeout(ping, 1000);
          });
      };
      ping();
    });
  }

  initialize() {
    if (!this.connected) return;
    // console.log(this.database)
    _.each(this.types, async (dataType, key) => {
      var obj = new dataType(this.database);
      await obj.create();
      await obj.initialize();
      this.dao[key] = obj;
    });
  }
}

// Singleton
module.exports = new DataConnector();
