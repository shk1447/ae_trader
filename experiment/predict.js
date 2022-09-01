const tf = require("@tensorflow/tfjs-node-gpu");
const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const fsPath = require("fs-path");
const moment = require("moment");
const dfd = require("danfojs-node");
const database = require("./utils/Database");
// const list = JSON.parse(
//   fs.readFileSync(path.resolve(__dirname, "./trading.json"), "utf8")
// );

let best_modelPath = path.resolve(__dirname, "./new_ae_model/model.json");
database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  const oldDate = moment().add(-133, "days");
  const list = await knex.raw(`SELECT * FROM stock_list`);
  // const list = await knex.raw(
  //   `SELECT * FROM stock_data WHERE marker = '매수' AND date >= ${
  //     oldDate.unix() * 1000
  //   }`
  // );

  const test_data = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];

    let dd = await knex.raw(
      `SELECT * FROM stock_data_${
        item.stock_code ? item.stock_code : item.code
      } WHERE date <= ${oldDate.unix() * 1000} ORDER BY date desc LIMIT 100`
    );

    if (
      dd.length > 0 &&
      moment(dd[0].date).format("YYYY-MM-DD") == oldDate.format("YYYY-MM-DD")
    ) {
      let scaler = new dfd.StandardScaler();
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
        test_data.push({
          code: item.stock_code ? item.stock_code : item.code,
          data: df_enc.values,
          date: moment(dd[0].date).format("YYYY-MM-DD"),
          meta: dd[0].meta,
          prev_meta: dd[1].meta,
        });
      }
    }
  }
  if (test_data.length > 0) {
    let best_model = await tf.loadLayersModel("file://" + best_modelPath);

    const [best_mse] = tf.tidy(() => {
      let dataTensor = tf.tensor2d(
        test_data.map((item) => item.data),
        [test_data.length, test_data[0].data.length]
      );
      let preds = best_model.predict(dataTensor, { batchSize: 1 });
      return [tf.sub(preds, dataTensor).square().mean(1), preds];
    });

    let best_array = await best_mse.array();

    // awesome condition
    let result_arr = test_data.map((d, idx) => {
      return {
        code: d.code,
        best: best_array[idx],
        date: d.date,
        buy: !d.meta.insight.resist < d.meta.insight.support,
      };
    });

    var aa = result_arr.filter(
      (d) => d.best <= 0.9416545629501343
      // &&
      // d.buy &&
      // !d.meta.future_support_price &&
      // d.meta.future_resist_price &&
      // !d.meta.resist_price
    );

    /*
      !d.meta.resist_price &&
      d.meta.support_price
  
      d.meta.future_resist_price &&
  
    */

    console.log(
      aa
        .sort((a, b) => a.best - b.best)
        .map((item) => {
          // delete item.meta;
          return item;
        })
    );
    console.log(aa.length);
  } else {
    console.log("not valid date");
  }
});
