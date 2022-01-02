import React, { useEffect, useState } from "react";
import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";
import Login from "./views/Login";
import Main from "./views/Main";
import { get } from "./utils/http";

function App() {
  useEffect(async () => {
    const { data, status } = await get("/auth/check");

    if (status == 200) {
      location.href = "/#/main";
    }
  }, []);
  return (
    <div className="App">
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/main" element={<Main />} />
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
