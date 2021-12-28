import LWS from 'light-ws/client';
var ws = new LWS({
  stock: { "subscribe?": ['string'], "publish?":[{code:'string', close:'int'}] }
});
ws.connect(`ws://${location.host}/vases`, function (e) {
  if (e.type == 'open') {
    console.log('connected light websocket')
  } else if(e.type == 'close') {
    console.log('disconnected light websocket')
  }
});

export default ws;