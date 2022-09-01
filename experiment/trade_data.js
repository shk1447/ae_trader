const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const fsPath = require("fs-path");
const moment = require("moment");
const dfd = require("danfojs-node");
const database = require("./utils/Database");
let list = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./trading.json"), "utf8")
);

var test = {};
_.each(list, (v, k) => {
  const date = moment(v.Time).format("YYYY-MM-DD");
  if (test[v.Name + date]) {
    if (test[v.Name + date].rate < v.Rate) {
      test[v.Name + date] = {
        Name: v.Name,
        Money: v.Money,
        Rate: v.Rate,
        Time: v.Time,
      };
    }
  } else {
    test[v.Name + date] = {
      Name: v.Name,
      Money: v.Money,
      Rate: v.Rate,
      Time: v.Time,
    };
  }
});
fsPath.writeFileSync("./trading.json", JSON.stringify(Object.values(test)));
