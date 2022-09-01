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

list = list.filter((s) => {
  return s.Rate > 3;
});

console.log(list.length);
const oldDate = moment().add(-60, "days");

database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  const aa = await knex.raw(
    `SELECT * FROM (SELECT * FROM (SELECT * FROM stock_data WHERE result < 103 AND result > 99 AND date <= ${
      oldDate.unix() * 1000
    } ORDER BY date desc) GROUP BY code)`
  );
  console.log("train_data : ", aa.length);
  let train_data = [];
  for (var i = 0; i < aa.length; i++) {
    var item = aa[i];

    let scaler = new dfd.StandardScaler();
    let dd = await knex.raw(
      `SELECT * FROM stock_data_${item.code} WHERE date <= ${item.date} ORDER BY date desc LIMIT 100`
    );

    let df = new dfd.DataFrame(
      dd.map((k) => {
        k.meta = JSON.parse(k.meta);
        return (
          (k.meta.insight.support -
            k.meta.insight.resist +
            k.meta.upward_point +
            k.meta.downward_point +
            k.meta.segmentation) *
          k.meta.curr_trend *
          k.meta.init_trend
        );
      })
    );
    scaler.fit(df);
    let df_enc = scaler.transform(df);
    if (dd.length == 100) {
      train_data.push({
        data: df_enc.values,
        target: 1,
      });
    }
  }

  const aa1 = await knex.raw(
    `SELECT * FROM (SELECT * FROM (SELECT * FROM stock_data WHERE result > 105 AND date <= ${
      oldDate.unix() * 1000
    } ORDER BY date desc) GROUP BY code)`
  );
  console.log("vaild_data : ", aa1.length);
  let valid_data = [];
  for (var i = 0; i < aa1.length; i++) {
    var item = aa1[i];

    let scaler = new dfd.StandardScaler();
    let dd = await knex.raw(
      `SELECT * FROM stock_data_${item.code} WHERE date <= ${item.date} ORDER BY date desc LIMIT 100`
    );

    let df = new dfd.DataFrame(
      dd.map((k) => {
        k.meta = JSON.parse(k.meta);
        return (
          (k.meta.insight.support -
            k.meta.insight.resist +
            k.meta.upward_point +
            k.meta.downward_point +
            k.meta.segmentation) *
          k.meta.curr_trend *
          k.meta.init_trend
        );
      })
    );
    scaler.fit(df);
    let df_enc = scaler.transform(df);
    if (dd.length == 100) {
      valid_data.push({
        data: df_enc.values,
        target: 0,
      });
    }
  }

  valid_data = valid_data.concat(train_data);

  valid_data = _.shuffle(valid_data);

  fsPath.writeFileSync(
    path.resolve(__dirname, `./reverse_train2.json`),
    JSON.stringify(_.shuffle(train_data))
  );

  fsPath.writeFileSync(
    path.resolve(__dirname, `./reverse_valid2.json`),
    JSON.stringify(valid_data)
  );

  console.log(valid_data.length);
  console.log(train_data.length);
});
