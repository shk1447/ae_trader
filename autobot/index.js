// Move the mouse across the screen as a sine wave.
const path = require("path");
const robot = require("robotjs");
const child_process = require("child_process");
const CronJob = require("cron").CronJob;
const autoProgramPath = `C:\\workspace\\private\\StockProgram\\StockProgram\\bin\\Release`;

robot.setKeyboardDelay(500);
robot.setMouseDelay(500);

let process;

var processStart = new CronJob(
  "10 8 * * 1-5",
  () => {
    robot.keyTap("d", "command");
    setTimeout(() => {
      process = child_process.execFile(
        path.resolve(autoProgramPath, "./StockProgram.exe"),
        { cwd: autoProgramPath }
      );
    }, 1000);
  },
  null,
  false,
  "Asia/Seoul"
);

processStart.start();

var loginProcess = new CronJob(
  "12 8 * * 1-5",
  () => {
    robot.moveMouse(1894, 35);

    robot.mouseClick();
    setTimeout(function () {
      robot.mouseClick();
    }, 1000);
  },
  null,
  false,
  "Asia/Seoul"
);

loginProcess.start();

var autoProcess = new CronJob(
  "15 8 * * 1-5",
  () => {
    robot.moveMouse(1834, 35);
    robot.mouseClick();
    setTimeout(function () {
      robot.mouseClick();
    }, 1000);
  },
  null,
  false,
  "Asia/Seoul"
);

autoProcess.start();

var killProcess = new CronJob(
  "5 17 * * 1-5",
  () => {
    try {
      if (process) process.kill();
      process = null;
    } catch (error) {
      console.log(error);
    }
  },
  null,
  false,
  "Asia/Seoul"
);

killProcess.start();
