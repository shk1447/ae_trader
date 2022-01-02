const Interface = require("../interface");

class StockFavorite extends Interface {
  constructor(database) {
    super(database);
    this.table_name = "stock_favorite";
    this.schema = {
      idx: {
        type: "increments",
        comment: "index field",
      },
      code: {
        type: "string",
        options: [50],
        unique: true,
      },
      user_id: {
        type: "string",
        options: [50],
        unique: true,
      },
      meta: {
        type: "text",
        options: ["longtext"],
        nullable: true,
      },
      date: {
        type: "timestamp",
        options: [
          {
            precision: 6,
          },
        ],
      },
    };
  }
}

module.exports = StockFavorite;
