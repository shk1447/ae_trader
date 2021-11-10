class Interface {
  constructor(database) {
    this.database = database;
  }
  create() {
    return this.database.schema.hasTable(this.table_name).then((exists) => {
      if (!exists) {
        var schema = this.schema;
        var table_name = this.table_name;
        return this.database.schema.createTable(this.table_name, function (t) {
          var indexer = {};
          var unique_keys = [];
          _.each(schema, (d, i) => {
            var column = t[d.type].apply(this, [i].concat(d.options));
            if (d.default) column.defaultTo(d.default)
            if (d.unique) unique_keys.push(i);
            if (d.nullable) column.nullable();
            if (d.notNullable) column.notNullable();

            if (d.index && d.index.length > 0) {
              _.each(d.index, (index_name, k) => {
                if (indexer[table_name + '_' + index_name]) {
                  indexer[table_name + '_' + index_name].push(i)
                } else {
                  indexer[table_name + '_' + index_name] = [i];
                }
              })
            }
          })
          if (unique_keys.length > 0) t.unique(unique_keys);
          _.each(indexer, (d, i) => {
            t.index(d, i);
          })
        })
      }
    }).catch((err) => {
      console.log("[" + this.table_name, ": initialize error] ", err)
    })
  }

  drop() {
    return this.database.schema.dropTable(this.table_name);
  }

  select(condition, selector) {
    var obj = this.database(this.table_name);
    if (selector) obj = obj.select(this.database.raw(selector))
    else obj = obj.select('*')
    if (condition) obj = obj.where(condition);
    return obj;
  }

  getTable() {
    return this.database(this.table_name);
  }

  insert(row) {
    return this.database(this.table_name).insert(row);
  }

  delete(condition) {
    return this.database(this.table_name).where(condition).del();
  }

  batchInsert(rows) {
    return this.database.batchInsert(this.table_name, rows, 30);
  }

  update(condition, row) {
    return this.database(this.table_name).where(condition).update(row);
  }

  truncate() {
    return this.database(this.table_name).truncate();
  }

  initialize() {
    // 개별적으로 필요할경우 구현해주세요.
    return new Promise((resolve, reject) => {
      resolve();
    })
  }
}

module.exports = Interface;
