const Interface = require('../interface');

class StockData extends Interface {
  constructor(database) {
    super(database)
    this.table_name = 'stock_data'
    this.schema = {
      idx: {
        type: 'increments',
        comment: "index field"
      },
      code: {
        type: 'string',
        options: [50],
        unique: true,
      },
      name: {
        type: 'string',
        options: [50]
      },
      open: {
        type: 'integer',
      },
      close: {
        type: 'integer',
      },
      high: {
        type: 'integer',
      },
      low: {
        type: 'integer',
      },
      volume: {
        type: 'integer',
      },
      date: {
        type: 'timestamp',
        options: [{
          precision: 6
        }],
        unique: true,
      }
    }
  }
}

module.exports = StockData;