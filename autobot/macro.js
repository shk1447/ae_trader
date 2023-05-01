const robot = require("robotjs");
const fs = require("fs");

const move = JSON.parse(fs.readFileSync("./move.json"));

robot.setMouseDelay(1000);
for (var m of move) {
  robot.moveMouse(m.x, m.y);
  robot.keyTap("left", ["alt"]);
}
