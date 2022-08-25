const moment = require("moment");

console.log(moment("2022-08-20") >= moment().add("day", -3));
