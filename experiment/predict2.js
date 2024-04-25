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

const train_data = [];
database({
  type: "better-sqlite3",
  "better-sqlite3": {
    filename: "../server/trader.db",
  },
}).then(async ({ knex }) => {
  for (var q = -1300; q < -1000; q++) {
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
        var aaa = [];
        var fff = [];
        var ccc = [];
        var bbb = [];

        var gg = [];
        var pp = [];
        var qq = [];
        var ww = [];
        var uu = [];
        var ii = [];
        var oo = [];
        var jj = [];

        const std_y = dd[0].close;
        const last_y = dd[dd.length - 1].close;

        // var std_degree = (Math.atan2(last_y - std_y, 100) * 180) / Math.PI;

        var min = Math.min(...dd.map((d) => d.low));
        var max = Math.max(...dd.map((d) => d.high));

        var std_degree = ((std_y - min) / (max - min)) * 100;
        // const std_degree =
        //   (std_y -
        //     ) /
        //       (Math.max(dd.map((d) => d.high)) -
        //         Math.min(dd.map((d) => d.low)))) *
        //   100;

        const cc = dd.map((k, i) => {
          k.meta = JSON.parse(k.meta);

          var degree = (Math.atan2(k.close - std_y, i) * 180) / Math.PI;
          bbb.push(degree);

          var _input =
            ((k.meta.insight.support -
              k.meta.insight.resist +
              k.meta.insight.future_resist -
              k.meta.insight.future_support) *
              k.meta.curr_trend *
              k.meta.init_trend *
              (k.meta.mfi / 100)) /
            k.meta.segmentation;

          gg.push(k.meta.insight.future_resist);

          pp.push(k.meta.insight.future_support);

          qq.push(k.meta.insight.support);

          ww.push(k.meta.insight.resist);

          uu.push(k.meta.segmentation);

          ii.push(k.meta.downward_point);
          oo.push(k.meta.upward_point);

          jj.push(k.volume);

          aaa.push(k.meta.curr_trend);
          fff.push(k.meta.recent_trend);

          ccc.push(k.meta.mfi);

          return _input;
        });

        let df = new dfd.DataFrame(cc);
        scaler.fit(df);
        let df_enc = scaler.transform(df);
        if (dd.length == 100) {
          test_data.push({
            code: item.stock_code ? item.stock_code : item.code,
            close: dd[0].close,
            prev_candle: dd[1].high - dd[1].low,
            candle: dd[0].high - dd[0].low,
            volume: dd[0].volume,
            data: df_enc.values,
            redata: _.sum(cc),
            redata0: _.mean(aaa),
            redata1: _.mean(fff),
            redata2: _.mean(gg),
            redata3: _.mean(pp),
            redata4: _.mean(qq),
            redata5: _.mean(ww),
            redata6: _.mean(uu),
            redata7: _.mean(ii),
            redata8: _.mean(oo),
            redata9: _.mean(jj),
            redata10: _.mean(ccc),
            redata11: _.mean(bbb),
            redata12: std_degree,
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
          redata: d.redata,
          redata0: d.redata0,
          redata1: d.redata1,
          redata2: d.redata2,
          redata3: d.redata3,
          redata4: d.redata4,
          redata5: d.redata5,
          redata6: d.redata6,
          redata7: d.redata7,
          redata8: d.redata8,
          redata9: d.redata9,
          redata10: d.redata10,
          redata11: d.redata11,
          redata12: d.redata12,
          prev_meta: d.prev_meta,
          buy: d.redata7 > d.redata8 && d.redata7 < d.meta.upward_point,
        };
      });

      var aa = result_arr.filter((d) => d.best < 0.9694517254829407 && d.buy);

      /*ADD_AND_UPDATE_AND_DELETE_CONTOUR_LABELS
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
            redata: item.redata,
            redata0: item.redata0,
            redata1: item.redata1,
            redata2: item.redata2,
            redata3: item.redata3,
            redata4: item.redata4,
            redata5: item.redata5,
            redata6: item.redata6,
            redata7: item.redata7,
            redata8: item.redata8,
            redata9: item.redata9,
            redata10: item.redata10,
            redata11: item.redata11,
            redata12: item.redata12,
            meta: item.meta,
            prev_meta: item.prev_meta,
          };
        });

      if (ahah.length > 0) {
        for (var qq = 0; qq < ahah.length; qq++) {
          let haha = ahah[qq];
          let hoho = await knex.raw(
            `SELECT * FROM stock_data_${haha.code} WHERE date > ${
              oldDate.unix() * 1000
            }`
          );
          var success = false;
          var fail = true;
          var best_result = 0;
          var best_days = 0;
          for (var h = 0; h < hoho.length; h++) {
            const result = hoho[h].high / haha.close;

            const diffDays = moment
              .duration(moment(hoho[h].date).diff(moment(haha.date)))
              .asDays();

            // 최고 수익율 확인용
            // if (result > best_result) {
            //   best_result = result;
            //   best_days = diffDays;
            // }
            // 단기 수익율 확인용
            if (result > 1.05) {
              best_result = result;
              best_days = diffDays;

              break;
            }
          }

          console.log(
            haha.code,
            haha.date,
            Math.floor((best_result - 1) * 10000) / 100 + "% 수익,",
            best_days + "일 소요",

            haha.redata11,
            haha.redata12,
            haha.redata10,
            haha.meta.mfi
          );

          // if (best_days > 100) {
          //   console.log(haha.meta, haha.prev_meta);
          // }

          if (best_result == 0 || best_days >= 100) {
            const test_log = {
              curr_trend: haha.meta.curr_trend,
              curr_trend_redata: haha.redata0,
              recent_trend: haha.meta.recent_trend,
              recent_trend_redata: haha.redata1,
              init_trend: haha.meta.init_trend,
              insight: haha.meta.insight,
              prev_insight: haha.prev_meta.insight,
              up_redata: haha.redata8,
              down_redata: haha.redata7,
              insight_redata: {
                support: haha.redata4,
                resist: haha.redata5,
                future_resist: haha.redata2,
                future_support: haha.redata3,
              },
              seg_redata: haha.redata6,
              seg: haha.meta.segmentation,
              days: best_days,
              result: best_result,
            };
            train_data.push(test_log);

            console.log(test_log);
          }
          // if (success) {
          //   console.log(haha.code, `${haha.date}:`, "success");

          // } else {
          //   if (fail) {
          //     train_data.push({ data: haha.redata, target: 0 });
          //   }
          // }
        }
      }
    } else {
      // console.log("invalid date");
    }
  }

  fsPath.writeFileSync(
    path.resolve(__dirname, `./cluster_train2.json`),
    JSON.stringify(_.shuffle(train_data))
  );
});
