const LightWS = require('light-ws/server');
const stock = require('../../models/stock.json')
module.exports = function(server) {
  var ws = new LightWS(stock);
  ws.listen({noServer:true, path:'/vases'}, server, function(type, ws) {
    console.log(type);
  });
  ws.on('stock/subscribe', function(data, client) {
    if(data && Array.isArray(data)) {
      if(!client['stock/subscribe']) client['stock/subscribe'] = []
      client['stock/subscribe'] = client['stock/subscribe'].concat(data);
      ws.response('stock/subscribe', client['stock/subscribe'], client);
    }
  })

  ws.on('stock/unsubscribe', function(data, client) {
    if(data && Array.isArray(data)) {
      data.forEach((d) => {
        client['stock/subscribe'].splice(client['stock/subscribe'].indexOf(d), 1);
      })
      ws.response('stock/unsubscribe', client['stock/subscribe'], client);
    }
  })
  return ws;
}