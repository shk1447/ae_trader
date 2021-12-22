const Interface = require('../interface');

class Session extends Interface {
  constructor(database) {
    super(database)
    this.table_name = 'session'
    this.schema = {
        idx : {
            type:'increments',
            comment:"index field"
        },
        sid : {
            type :'string',
            unique:true,
            options:[255]
        },
        sess : {
            type :'text',
            notNullable:true
        },
        expired : {
            type :'dateTime',
            notNullable:true,
            index:['idx_expired']
        }
    }
  }
}

module.exports = Session;
