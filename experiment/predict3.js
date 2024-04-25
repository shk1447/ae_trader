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
let reverse_modelPath = path.resolve(
  __dirname,
  "./reverse_ae_model/model.json"
);
database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  for (var q = -420; q < -60; q++) {
    const oldDate = moment().add(q, "days");
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
        const cc = dd.map((k) => {
          k.meta = JSON.parse(k.meta);
          return (
            ((k.meta.insight.support -
              k.meta.insight.resist +
              k.meta.insight.future_resist -
              k.meta.insight.future_support) *
              k.meta.curr_trend *
              k.meta.init_trend *
              (k.meta.mfi / 100)) /
            k.meta.segmentation
          );
        });

        let df = new dfd.DataFrame(cc);
        scaler.fit(df);
        let df_enc = scaler.transform(df);
        if (dd.length == 100) {
          test_data.push({
            code: item.stock_code ? item.stock_code : item.code,
            close: dd[0].close,
            prev_candle: dd[1].close - dd[1].open,
            candle: dd[0].close - dd[0].open,
            volume: dd[0].volume,
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
      let reverse_model = await tf.loadLayersModel(
        "file://" + reverse_modelPath
      );

      const [best_mse, reverse_mse] = tf.tidy(() => {
        let dataTensor = tf.tensor2d(
          test_data.map((item) => item.data),
          [test_data.length, test_data[0].data.length]
        );
        let preds = best_model.predict(dataTensor, { batchSize: 1 });
        let reverse_preds = reverse_model.predict(dataTensor, { batchSize: 1 });
        return [
          tf.sub(preds, dataTensor).square().mean(1),
          tf.sub(reverse_preds, dataTensor).square().mean(1),
        ];
      });

      let best_array = await best_mse.array();
      let reverse_array = await reverse_mse.array();

      // awesome condition
      let result_arr = test_data.map((d, idx) => {
        return {
          code: d.code,
          close: d.close,
          best: best_array[idx],
          reverse: reverse_array[idx],
          date: d.date,
          meta: d.meta,
          prev_meta: d.prev_meta,
          buy: d.meta.insight.future_resist > d.prev_meta.insight.future_resist,
        };
      });

      var aa = result_arr.filter((d) => d.best < 0.9519748091697693);

      /*
        !d.meta.resist_price &&
        d.meta.support_price
    
        d.meta.future_resist_price &&
    
      */
      // const c = _.groupBy(
      //   aa
      //     .sort((a, b) => a.best - b.best)
      //     .map((d) => {
      //       d.best = Math.floor(d.best * 100) / 100;
      //       return d;
      //     }),
      //   "best"
      // );

      // console.log(
      //   .map((item) => {
      //     // delete item.meta;
      //     return { code: item.code, date: item.date, best: item.best };
      //   })
      // );

      var ahah = aa
        .sort((a, b) => a.best - b.best)
        .map((item) => {
          // delete item.meta;
          return {
            code: item.code,
            close: item.close,
            date: item.date,
            best: item.best,
          };
        });

      if (ahah.length > 0) {
        let haha = ahah[0];
        let hoho = await knex.raw(
          `SELECT * FROM stock_data_${haha.code} WHERE date > ${
            oldDate.unix() * 1000
          }`
        );
        var success = false;
        for (var h = 0; h < hoho.length; h++) {
          const result = hoho[h].high / haha.close;
          if (result > 1.05) {
            success = true;
            console.log(
              haha.code,
              `매수(${haha.date}):`,
              "매도",
              moment(hoho[h].date).format("YYYY-MM-DD"),
              `결과(${result * 100}%)`
            );
            break;
          }
        }
        if (!success) {
          console.log(haha.code, `${haha.date}:`, "fail");
        }
      }
    } else {
      console.log("not valid date");
    }
  }
});
