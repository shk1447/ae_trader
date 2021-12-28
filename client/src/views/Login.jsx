import React, { useState } from 'react'
import KakaoButton from 'react-kakao-button'

function Login(props) {
  const handleKakaoAuth = (e) => {
    e.preventDefault();
    location.href = "/auth/kakao";
  }
  return (<div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'rgba(0,0,0,0.1)'}}>
    <div style={{
      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
      background: 'transparent',
      margin: 0,
      padding: 0,
      border: 'none',
      textAlign: 'center',
      cursor: 'pointer',
      userSelect: 'none',
      width: '222px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'}}
      onClick={handleKakaoAuth}>
        <img src={'//k.kakaocdn.net/14/dn/btqCn0WEmI3/nijroPfbpCa4at5EIsjyf0/o.jpg'} />
    </div>
  </div>)
}

export default Login;