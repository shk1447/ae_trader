const LightWS = require('light-ws/server');

module.exports = function(server) {
  var ws = new LightWS({
    stock: { "subscribe?": ['string'], "publish?":[{code:'string', close:'int'}] }
  });
  ws.listen({noServer:true, path:'/vases'}, server, function(type, ws) {
    console.log(type);
  });
  ws.on('stock', function(data, client) {
    if(data.subscribe) {
      client['subscribe'] = data.subscribe;
    }
  })
  return ws;
}