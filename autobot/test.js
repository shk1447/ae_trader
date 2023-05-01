"use strict";
const nodeAbi = require("node-abi");

console.log(nodeAbi.getAbi("15.14.0", "node"));
console.log(nodeAbi.getAbi("12.2.3", "electron"));

// const ioHook = require("iohook");

// console.log("aa");
// ioHook.on("keydown", (event) => {
//   console.log(event);
// });

// ioHook.start();
// // ioHook.start(true);

// const wait = (sec) => {
//   const start = Date.now();
//   let now = start;

//   while (now - start < sec * 1000) {
//     now = Date.now();
//   }
// };

// setInterval(() => {
//   wait(1);
// }, 1000);
