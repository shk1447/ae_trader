import React, { useState } from "react";

function Login() {
  const handleKakaoAuth = (e) => {
    e.preventDefault();
    const url = import.meta.env.DEV
      ? "http://localhost/auth/kakao"
      : "http://stock.vases.ai/auth/kakao";
    location.href = url;
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
          background: "transparent",
          margin: 0,
          padding: 0,
          border: "none",
          textAlign: "center",
          cursor: "pointer",
          userSelect: "none",
          width: "222px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={handleKakaoAuth}
      >
        <img
          src={
            "//k.kakaocdn.net/14/dn/btqCn0WEmI3/nijroPfbpCa4at5EIsjyf0/o.jpg"
          }
        />
      </div>
    </div>
  );
}

export default Login;
