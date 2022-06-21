// {
//   acc: 0.9488636363636364,
//   threshold: 0.9592024087905884,
//   tp: 751,
//   tn: 84,
//   fp: 4,
//   fn: 41,
//   tpr: 0.9482323232323232,
//   fpr: 0.045454545454545456,
//   fnr: 0.05176767676767677,
//   tnr: 0.9545454545454546,
//   precision: 0.9947019867549669,
//   recall: 0.9482323232323232
// }

const tf = require("@tensorflow/tfjs-node-gpu");
const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const fsPath = require("fs-path");
const moment = require("moment");
const dfd = require("danfojs-node");
const database = require("./utils/Database");
const list = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./trading.json"), "utf8")
);
const oldDate = moment().add(-10, "days");
let best_modelPath = path.resolve(__dirname, "./ae_model/model.json");
database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  const list = await knex.raw(`SELECT * FROM stock_list`);

  const test_data = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];

    let scaler = new dfd.StandardScaler();
    let dd = await knex.raw(
      `SELECT * FROM stock_data_${item.stock_code} ORDER BY date desc LIMIT 100`
    );

    let df = new dfd.DataFrame(
      dd.map((k) => {
        k.meta = JSON.parse(k.meta);
        return (
          (k.meta.insight.support - k.meta.insight.resist) *
          k.meta.curr_trend *
          k.meta.init_trend
        );
      })
    );
    scaler.fit(df);
    let df_enc = scaler.transform(df);
    if (dd.length == 100) {
      test_data.push({
        code: item.stock_code,
        data: df_enc.values,
        date: moment(item.date).format("YYYY-MM-DD"),
        meta: dd[0].meta,
      });
    }
  }

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

  let result_arr = test_data.map((d, idx) => {
    return {
      code: d.code,
      best: best_array[idx],
      date: d.date,
      meta: d.meta.insight,
    };
  });

  var aa = result_arr.filter(
    (d) =>
      d.best <= 0.9592024087905884 &&
      !d.meta.future_support_price &&
      d.meta.future_resist_price &&
      d.meta.support_price
  );

  console.log(
    aa
      .sort((a, b) => a.best - b.best)
      .map((item) => {
        delete item.meta;
        return item;
      })
  );
  console.log(aa.length);
});
