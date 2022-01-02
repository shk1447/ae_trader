import React, { useState } from 'react'
import './App.css'
import {HashRouter, Route, Routes} from 'react-router-dom'
import Login from './views/Login'
import Main from './views/Main'

function App() {
  return (
    <div className="App">
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/main" element={<Main />} />  
        </Routes>
      </HashRouter>
    </div>
  )
}

export default App
