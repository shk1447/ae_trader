import LWS from 'light-ws/client';
var ws = new LWS({ 'stock': { code: 'string' } });
ws.connect('ws://localhost:8081/vases', function (e) {
  if (e.type == 'open') {
    ws.on('stock', function(data) {
      console.log(data);
    })
    ws.send('stock', {code:'000020'})
  }
});

export default ws;