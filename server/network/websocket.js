const LightWS = require('light-ws/server');

module.exports = function(server) {
  var ws = new LightWS({'stock': {
    'code' :'string'
  }});
  ws.listen({noServer:true, path:'/vases'}, server, function(type, ws) {
    console.log(type);
  });
  ws.on('stock', function(data, client) {
    console.log(data);
  })
  return ws;
}