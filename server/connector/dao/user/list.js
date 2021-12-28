
const Interface = require('../interface');

class UserList extends Interface {
  constructor(database) {
    super(database)
    this.table_name = 'user_list'
    this.schema = {
      idx: {
        type: 'increments',
        comment: "index field"
      },
      id: {
        type: 'string',
        options: [50],
        unique: true,
      },
      provider: {
        type: 'string',
        options: [50],
        unique: true,
      },
      pwd: {
        type: 'string',
        options: [50]
      },
      created_at: {
        type: 'timestamp',
        options: [{
          precision: 6
        }]
      }
    }
  }
}

module.exports = UserList;
