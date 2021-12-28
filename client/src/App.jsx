import React, { useState } from 'react'
import './App.css'
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'
import Login from './views/Login'
import Main from './views/Main'

function App(props) {
  console.log(props.ws);
  

  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<Login ws={props.ws} />} />
          <Route path="/main" element={<Main ws={props.ws} />} />  
        </Routes>
      </Router>
    </div>
  )
}

export default App
