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

const mean = _.mean(list.filter((d) => d.Rate > 2.5).map((d) => d.Rate));
console.log(mean);
list = list.filter((s) => {
  return s.Rate > mean;
});

console.log(list.length);
const oldDate = moment().add(-220, "days");

database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  var test = {};
  _.each(list, (v, k) => {
    const date = moment(v.Time).format("YYYY-MM-DD");
    test[v.Name + date] = { name: v.Name, rate: v.Rate, time: v.Time };
  });
  const orgs = Object.values(test);
  var test2 = {};
  _.each(orgs, (org) => {
    test2[org.name] = org;
  });
  const data = await knex.raw(
    `SELECT * FROM stock_list WHERE stock_name in (${orgs
      .map((v) => `'${v.name}'`)
      .toString()});`
  );
  console.log(test2);
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    test2[item.stock_name].code = item.stock_code;

    const qqq = await knex.raw(
      `SELECT * FROM stock_data_${item.stock_code} WHERE date <= ${
        moment(test2[item.stock_name].time).unix() * 1000
      } AND result is not null ORDER BY date desc LIMIT 1`
    );
    if (qqq.length > 0) {
      test2[item.stock_name].date = qqq[0].date;
    }
    // console.log(qqq[0].date);
  }

  const train_data = [];
  for (var i = 0; i < orgs.length; i++) {
    var item = orgs[i];
    if (test2[item.name].code) {
      let scaler = new dfd.StandardScaler();
      const dd = await knex.raw(
        `SELECT * FROM stock_data_${test2[item.name].code} WHERE date <= '${
          test2[item.name].date
        }' ORDER BY date desc LIMIT 100`
      );

      let df = new dfd.DataFrame(
        dd.map((k) => {
          k.meta = JSON.parse(k.meta);

          return (
            ((k.meta.insight.support -
              k.meta.insight.resist +
              k.meta.insight.future_resist -
              k.meta.insight.future_support) *
              k.meta.curr_trend *
              k.meta.init_trend *
              (k.meta.mfi / 100)) /
            (k.meta.segmentation + k.meta.upward_point + k.meta.downward_point)
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
  }

  const check_arr = Object.values(test2).map((d) => d.code);

  const aa = await knex.raw(
    `SELECT * FROM (SELECT * FROM (SELECT * FROM stock_data WHERE result < 102 AND date <= ${
      oldDate.unix() * 1000
    } ORDER BY date desc) GROUP BY code) WHERE code not in 
    (${Object.values(test2)
      .map((v) => `'${v.code}'`)
      .toString()})`
  );
  console.log("vaild_data : ", aa.length);
  let valid_data = [];
  for (var i = 0; i < aa.length; i++) {
    var item = aa[i];
    if (check_arr.includes(item.code)) continue;
    let scaler = new dfd.StandardScaler();
    let dd = await knex.raw(
      `SELECT * FROM stock_data_${item.code} WHERE date <= ${item.date} ORDER BY date desc LIMIT 100`
    );

    let df = new dfd.DataFrame(
      dd.map((k) => {
        k.meta = JSON.parse(k.meta);
        return (
          ((k.meta.insight.support -
            k.meta.insight.resist +
            k.meta.insight.future_resist -
            k.meta.insight.future_support) *
            k.meta.curr_trend *
            k.meta.init_trend *
            (k.meta.mfi / 100)) /
          (k.meta.segmentation + k.meta.upward_point + k.meta.downward_point)
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
  console.log(valid_data.length);
  valid_data = _.shuffle(valid_data);
  valid_data = valid_data.concat(train_data);

  fsPath.writeFileSync(
    path.resolve(__dirname, `./train2.json`),
    JSON.stringify(_.shuffle(train_data))
  );

  fsPath.writeFileSync(
    path.resolve(__dirname, `./valid2.json`),
    JSON.stringify(valid_data)
  );
  console.log(train_data.length);
  console.log(valid_data.length);
});
