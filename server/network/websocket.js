const LightWS = require('light-ws/server');
const stock = require('../../models/stock.json')
const session = require('express-session');

module.exports = function(server) {
  const ws = new LightWS(stock);
  const sessionParser = session({
    key: 'vases_sid',
    secret: 'vases',
    cookie: {
          maxAge: 1000 * 60 * vases.config.session_time
        },
        saveUninitialized: false,
        resave: false,
        store: vases.session_store,
        rolling: true
  })

  ws.listen({noServer:true, path:'/vases'}, server, function(type, ws) {
    console.log(type);
  });

  ws.on('stock/subscribe', function(data, client, req) {
    sessionParser(req,{}, () => {
      if(data && Array.isArray(data)) {
        if(!client['stock/subscribe']) client['stock/subscribe'] = []
        client['stock/subscribe'] = client['stock/subscribe'].concat(data);
        ws.response('stock/subscribe', client['stock/subscribe'], client);
      }
    })
  })

  ws.on('stock/unsubscribe', function(data, client, req) {
    sessionParser(req,{}, () => {
      if(data && Array.isArray(data)) {
        data.forEach((d) => {
          client['stock/subscribe'].splice(client['stock/subscribe'].indexOf(d), 1);
        })
        ws.response('stock/unsubscribe', data, client);
      }
    })
  })

  return ws;
}