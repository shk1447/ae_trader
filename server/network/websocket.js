const LightWS = require('light-ws');

module.exports = function(server) {
  var ws = new LightWS();
  ws.listen({noServer:true, path:'/vases'}, server);
  return ws;
}