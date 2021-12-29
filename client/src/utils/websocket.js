import LWS from 'light-ws/client';
import stock from '../../../models/stock.json'

var ws = new LWS(stock);
const url = `ws://${location.host}/vases`;
const connect = () => {
  ws.connect(url, function (e) {
    if (e.type == 'open') {
      console.log('connected light websocket');
    } else if(e.type == 'close') {
      console.log('disconnected light websocket');
      setTimeout(() => {
        connect();
      },1000)
    }
  });
}
connect();

export default ws;