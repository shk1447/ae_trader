import React from "react";
import ReactDOM from "react-dom";

import "./index.css";
import App from "./App";
import "antd/dist/antd.css";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
document.addEventListener("deviceready", () => {}, false);

Notification.requestPermission().then((permission) => {
  if (permission == "granted") {
    // alert("활성화");
  } else {
    // alert("비활성화");
  }
});
