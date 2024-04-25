const tf = require("@tensorflow/tfjs-node-gpu");
const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const fsPath = require("fs-path");
const moment = require("moment");
const dfd = require("danfojs-node");
const database = require("./utils/Database");
var clustering = require("density-clustering");
// const list = JSON.parse(
//   fs.readFileSync(path.resolve(__dirname, "./trading.json"), "utf8")
// );

let rawdata = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./cluster_train2.json"))
);

let best_modelPath = path.resolve(__dirname, "./new_ae_model/model.json");
database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  const oldDate = moment().add(-525, "days");
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
          (k.meta.segmentation + k.meta.upward_point + k.meta.downward_point)
        );
      });

      let df = new dfd.DataFrame(cc);
      scaler.fit(df);
      let df_enc = scaler.transform(df);
      if (dd.length == 100) {
        test_data.push({
          code: item.stock_code ? item.stock_code : item.code,
          data: df_enc.values,
          redata: _.sum(cc),
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
        data: d.redata,
        date: d.date,
        meta: d.meta,
        prev_meta: d.prev_meta,
        buy:
          d.prev_meta.recent_trend < 0 &&
          d.meta.insight.support > 0 &&
          d.prev_meta.insight.support == 0 &&
          d.meta.insight.future_resist >= d.meta.insight.future_support,
      };
    });

    var aa = result_arr.filter((d) => d.best < 0.97 && d.buy);

    // const dataset = rawdata.map((d) => d.data);

    // var dbscan = new clustering.DBSCAN();

    // var clusters = dbscan.run(dataset.concat(aa.map((d) => d.data)), 5, 2);

    // clusters.forEach((d) => {
    //   d.forEach((j) => {
    //     if (j >= dataset.length) {
    //       console.log(
    //         aa[j - dataset.length].code,
    //         `(${aa[j - dataset.length].best}) : `,
    //         aa[j - dataset.length].date
    //       );
    //     }
    //   });
    // });
    // console.log(clusters01);

    /*
      !d.meta.resist_price &&
      d.meta.support_price
  
      d.meta.future_resist_price &&
  
    */
    // const c = _.groupBy(
    //   aa.map((d) => {
    //     d.best = Math.floor(d.best * 1000) / 1000;
    //     return d;
    //   }),
    //   "best"
    // );

    // console.log(
    //   Object.values(c)[0].map((item) => {
    //     // delete item.meta;
    //     return { code: item.code, date: item.date, best: item.best };
    //   })
    // );

    console.log(
      aa
        .sort((a, b) => a.best - b.best)
        .map((item) => {
          // delete item.meta;
          return { code: item.code, date: item.date, best: item.best };
        })
    );
    console.log(aa.length);
  } else {
    console.log("not valid date");
  }
});
