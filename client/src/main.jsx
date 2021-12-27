import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import 'antd/dist/antd.css';
import ws from './utils/websocket';

ReactDOM.render(
  <React.StrictMode>
    <App ws={ws}/>
  </React.StrictMode>,
  document.getElementById('root')
)
