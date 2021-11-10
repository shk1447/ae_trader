
const Interface = require('../interface');

class StockList extends Interface {
  constructor(database) {
    super(database)
    this.table_name = 'stock_list'
    this.schema = {
      idx: {
        type: 'increments',
        comment: "index field"
      },
      stock_code: {
        type: 'string',
        options: [50]
      },
      stock_name: {
        type: 'string',
        options: [50]
      },
      stock_total: {
        type: 'integer',
      },
      stock_per: {
        type: 'integer',
      },
      stock_roe: {
        type: 'integer',
      }
    }
  }
}

module.exports = StockList;
