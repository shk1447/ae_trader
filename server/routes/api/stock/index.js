const collector = require("../../modules/NaverFinance");
const analysis = require("../../modules/Analysis");
const connector = require("../../../connector");

const cliProgress = require("cli-progress");
const moment = require("moment");

const cluster = require("cluster");

const tf = require("@tensorflow/tfjs");
const dfd = require("danfojs");

const { segmentation } = require("../../modules/Analysis");
const {
  IchimokuCloud,
  BollingerBands,
  MFI,
  OBV,
  SMA,
} = require("technicalindicators");
const path = require("path");

const _ = require("lodash");

let collecting = false;

const convertToHoga = (price) => {
  let hoga_price = Math.round(price);
  if (price < 1000) {
    hoga_price = hoga_price;
  } else if (price < 5000) {
    hoga_price = hoga_price - (hoga_price % 5);
  } else if (price < 10000) {
    hoga_price = hoga_price - (hoga_price % 10);
  } else if (price < 50000) {
    hoga_price = hoga_price - (hoga_price % 50);
  } else if (price < 100000) {
    hoga_price = hoga_price - (hoga_price % 100);
  } else if (price < 500000) {
    hoga_price = hoga_price - (hoga_price % 100);
  } else {
    hoga_price = hoga_price - (hoga_price % 100);
  }
  return hoga_price;
};

const collectFunc = async (code, days) => {
  const best_model = await tf.loadLayersModel(
    "http://127.0.0.1:8081/new_ae_model/model.json"
  );

  return new Promise(async (resolve, reject) => {
    let stockList = await connector.dao.StockList.select(code);

    stockList = _.shuffle(stockList);

    const progress_bar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progress_bar.start(stockList.length, 0);

    const nextStep = async (step) => {
      if (step < stockList.length) {
        var item = stockList[step];

        const stockData = new connector.types.StockData(connector.database);
        stockData.table_name = "stock_data_" + item.stock_code;
        // connector.dao.StockData.table_name = "stock_data_" + item.stock_code;

        // const test_data = await stockData.getTable();

        // if (test_data.length > 50) {
        //   progress_bar.update(step + 1);
        //   nextStep(step + 1);
        //   return;
        // } else {
        //   await stockData.truncate();
        // }

        let rows = [];
        let recommended_rows = [];
        const data = await collector.getSise(item.stock_code, days);
        console.log(data);

        if (data.length > 0) {
          const origin_data = await stockData
            .getTable()
            .where("date", "<", data[0].date);
          const all_data = origin_data.concat(data).map((d) => {
            if (d.meta) {
              d.meta = JSON.parse(d.meta);
            }
            return d;
          });

          let prev_result;
          let recent_data;
          if (origin_data.length > 0) {
            if (origin_data[origin_data.length - 1].meta) {
              recent_data = origin_data[origin_data.length - 1];
            }
            if (all_data.length - data.length > 0) {
              prev_result = { ...all_data[all_data.length - data.length - 1] };
            }
          }

          for (
            let i = all_data.length - data.length;
            i < all_data.length;
            i++
          ) {
            let row = { ...all_data[i] };

            row["code"] = item.stock_code;
            try {
              let result = {
                volume: row.volume,
                close: row.close,
                high: row.high,
                open: row.open,
                low: row.low,
                curr_trend: 0,
                init_trend: 0,
                segmentation: [],
                upward_point: [],
                downward_point: [],
              };

              var curr_data = [...all_data].splice(0, i + 1);
              analysis.segmentation(curr_data, result, "close");

              let insight = analysis.cross_point(result, row, "close");

              result.segmentation.sort((a, b) => a.from.date - b.from.date);
              result.upward_point.sort((a, b) => a.date - b.date);
              result.downward_point.sort((a, b) => a.date - b.date);

              let meta = {
                date: moment(row.date).format("YYYY-MM-DD"),
                curr_trend: result.curr_trend,
                init_trend: result.init_trend,
                attack_avg: recent_data ? recent_data.meta.attack_avg : 0,
                trend_cnt: recent_data ? recent_data.meta.trend_cnt : 0,
                recent_trend: recent_data ? recent_data.meta.recent_trend : 0,
                total_trend: recent_data ? recent_data.meta.total_trend : 0,
                segmentation: result.segmentation.length,
                segmentation_mean: _.mean(
                  result.segmentation.map((d) => d.avg)
                ),
                segmentation_avg:
                  result.segmentation.length > 0
                    ? result.segmentation[result.segmentation.length - 1].avg
                    : 0,
                upward_point: result.upward_point.length,
                downward_point: result.downward_point.length,
                insight: insight,
                mfi: 0,
              };

              if (curr_data.length > 20) {
                var input = {
                  high: [],
                  low: [],
                  close: [],
                  volume: [],
                  period: 20,
                };
                [...curr_data].splice(i - 21, i + 1).forEach((d) => {
                  input.high.push(d.high);
                  input.low.push(d.low);
                  input.close.push(d.close);
                  input.volume.push(d.volume);
                });
                let mfi = new MFI(input);
                meta.mfi = mfi.result[0];
              }

              /*
              spanA > spanB 양운
              spanA < spanB 음운
              conversion 전환선
              base 기준선
            */

              // console.log(curr_data.length);
              // if (curr_data.length > 100) {
              //   let scaler = new dfd.StandardScaler();

              //   const aa = curr_data.slice(
              //     curr_data.length - 100,
              //     curr_data.length
              //   );

              //   const dataset = aa.sort((a, b) => b.date - a.date);
              //   dataset[0]["meta"] = meta;
              //   const bb = dataset.map((k) => {
              //     return (
              //       ((k.meta.insight.support -
              //         k.meta.insight.resist +
              //         k.meta.insight.future_resist -
              //         k.meta.insight.future_support) *
              //         k.meta.curr_trend *
              //         k.meta.init_trend *
              //         (k.meta.mfi / 100)) /
              //       (k.meta.segmentation +
              //         k.meta.upward_point +
              //         k.meta.downward_point)
              //     );
              //   });

              //   let df = new dfd.Series(bb);
              //   scaler.fit(df);
              //   let df_enc = scaler.transform(df);
              //   const test_data = [];
              //   if (dataset.length == 100) {
              //     test_data.push({
              //       code: item.stock_code,
              //       data: df_enc.values,
              //       meta: dataset[0].meta,
              //       prev_meta: dataset[1].meta,
              //     });

              //     const [best_mse] = tf.tidy(() => {
              //       let dataTensor = tf.tensor2d(
              //         test_data.map((item) => item.data),
              //         [test_data.length, test_data[0].data.length]
              //       );
              //       let preds = best_model.predict(dataTensor, {
              //         batchSize: 1,
              //       });
              //       return [tf.sub(preds, dataTensor).square().mean(1), preds];
              //     });

              //     let best_array = await best_mse.array();

              //     let result_arr = test_data.map((d, idx) => {
              //       return {
              //         code: d.code,
              //         best: best_array[idx],
              //         buy:
              //           d.prev_meta.recent_trend < 0 &&
              //           d.meta.insight.support >= d.prev_meta.insight.support &&
              //           d.meta.insight.support >= 1 &&
              //           d.prev_meta.insight.support <= 1 &&
              //           d.prev_meta.mfi > d.meta.mfi &&
              //           d.meta.insight.future_resist >=
              //             d.meta.insight.future_support,
              //       };
              //     });

              //     // if (result_arr.length > 0) {
              //     //   row["label"] = result_arr[0].best;
              //     // }

              //     var goods = result_arr.filter(
              //       (d) => d.best < 0.9841759204864502 && d.buy
              //     );

              //     if (goods.length > 0) {
              //       row["marker"] = "AI매수";

              //       let futures = all_data.slice(i + 1, i + 61);
              //       if (futures.length > 0) {
              //         var max_point = [...futures].sort(
              //           (a, b) => b.high - a.high
              //         )[0];
              //         var high_rate = (max_point.high / row.close) * 100;

              //         row["result"] = high_rate;
              //       } else {
              //         row["result"] = 100;
              //       }

              //       recommended_rows.push(row);
              //     }
              //   }
              // }

              result["meta"] = meta;
              all_data[i]["meta"] = meta;

              if (prev_result) {
                result.meta.trend_cnt = prev_result.meta.trend_cnt;
                result.meta.total_trend = prev_result.meta.total_trend;
                result.meta.recent_trend = prev_result.meta.recent_trend;
                result.meta.prev_mfi = prev_result.meta.mfi;
                result.meta.step_mfi = prev_result.meta.step_mfi;
                result.meta.prev_segmentation_mean =
                  prev_result.meta.segmentation_mean;

                if (
                  prev_result.meta.curr_trend == result.meta.curr_trend &&
                  prev_result.meta.segmentation - result.meta.segmentation > 0
                ) {
                  result.meta.recent_trend =
                    result.meta.curr_trend > 0 ? +1 : -1;
                  if (
                    prev_result.meta.recent_trend != result.meta.recent_trend
                  ) {
                    result.meta.trend_cnt = 0;
                  }
                  if (result.meta.mfi) {
                    result.meta.step_mfi = result.meta.mfi;
                  }
                  result.meta.trend_cnt += result.meta.curr_trend > 0 ? +1 : -1;
                  result.meta.total_trend +=
                    result.meta.curr_trend > 0 ? +1 : -1;
                }

                var condition01 =
                  result.meta.recent_trend < 0 &&
                  prev_result.meta.curr_trend < 0 &&
                  result.meta.curr_trend > 0 &&
                  prev_result.meta.prev_mfi > prev_result.meta.mfi &&
                  result.meta.prev_mfi < result.meta.mfi &&
                  prev_result.meta.insight.support <=
                    prev_result.meta.insight.resist &&
                  result.meta.insight.support > result.meta.insight.resist &&
                  (prev_result.meta.insight.future_support >
                    result.meta.insight.future_support ||
                    prev_result.meta.insight.future_resist <
                      result.meta.insight.future_resist);

                if (condition01) {
                  row["marker"] = "매수";
                  let futures = all_data.slice(i + 1, i + 61);
                  if (futures.length > 0) {
                    var max_point = [...futures].sort(
                      (a, b) => b.high - a.high
                    )[0];
                    var high_rate = (max_point.high / result.close) * 100;

                    row["result"] = high_rate;
                  } else {
                    row["result"] = 100;
                  }

                  recommended_rows.push(row);
                }

                // if (
                //   // result.meta.curr_trend > 0 &&
                //   // ((!prev_result.meta.insight.support_price &&
                //   //   insight.support_price) ||
                //   //   (prev_result.meta.insight.resist_price &&
                //   //     !insight.resist_price)) &&
                //   // prev_result.meta.segmentation > 3 &&
                //   // insight.support >= prev_result.meta.insight.resist &&
                //   // !prev_result.meta.insight.future_support_price &&
                //   // result.meta.insight.future_support_price
                //   result.meta.recent_trend < 0 &&
                //   prev_result.meta.curr_trend < 0 &&
                //   result.meta.curr_trend > 0 &&
                //   result.close > result.meta.segmentation_avg &&
                //   prev_result.close < prev_result.meta.segmentation_avg
                // ) {

                // }
              }

              row["meta"] = JSON.stringify(meta);
              row["label"] = result.meta.trend_cnt;
              prev_result = result;
            } catch (error) {
              console.log(error);
            }

            rows.push(row);
          }

          if (rows.length > 0) {
            if (rows.length > 50) {
              await stockData.batchInsert(rows);
            } else {
              await stockData.insert(rows).onConflict(["code", "date"]).merge();
            }
          }

          if (recommended_rows.length > 0) {
            stockData.table_name = "stock_data";
            if (recommended_rows.length > 50) {
              await stockData.batchInsert(recommended_rows);
            } else {
              await stockData
                .insert(recommended_rows)
                .onConflict(["code", "date"])
                .merge();
            }
          }
        }

        progress_bar.update(step + 1);
        nextStep(step + 1);
      } else {
        collecting = false;
        progress_bar.stop();
        resolve();
      }
    };
    nextStep(0);
  });
};

const collect_job_func2 = async () => {
  // const data = new connector.types.StockData(connector.database);
  // await data.truncate();
  const code = {};
  const days = 49;
  // const stockData = new connector.types.StockData(connector.database);
  // var date = moment().add(-40, "days").format("YYYY-MM-DD 00:00:00");
  // const today_unix = moment(date).unix() * 1000;

  // await stockData.getTable().where("date", ">=", today_unix).del();

  // var date = moment().format("YYYY-MM-DD 00:00:00");
  // const today_unix = moment(date).unix() * 1000;

  // await stockData.getTable().where({ date: today_unix }).del();

  await collectFunc(code, days);
};

const collect_job_func = async () => {
  // const data = new connector.types.StockData(connector.database);
  // await data.truncate();
  const code = {};
  const days = 2;
  const stockData = new connector.types.StockData(connector.database);
  var date = moment().format("YYYY-MM-DD 00:00:00");
  const today_unix = moment(date).unix() * 1000;

  await stockData.getTable().where({ date: today_unix }).del();

  await collectFunc(code, days);
};

const status_job_func = async () => {
  const stockFavorite = new connector.types.StockFavorite(connector.database);
  const data = await stockFavorite.getTable().groupBy("code");

  data.forEach(async (item) => {
    const code = item.code;
    await collectFunc({ stock_code: code }, 1);

    const stockData = new connector.types.StockData(connector.database);
    stockData.table_name = "stock_data_" + code;

    let data = await stockData.getTable().orderBy("date", "desc").limit(1);

    let curr_data = data[data.length - 1];
    curr_data["meta"] = JSON.parse(curr_data["meta"]);

    let count = 1;
    let buy_count = 1;
    let sell_price = curr_data.low;
    let buy_price = curr_data.close;

    if (curr_data.meta.band) {
      sell_price += curr_data.meta.band.upper;
      buy_price += curr_data.meta.band.lower;
      buy_count++;
      count++;
    }

    if (curr_data.meta.insight && curr_data.meta.insight.resist_price) {
      sell_price += curr_data.meta.insight.resist_price;
      count++;
    }

    if (curr_data.meta.insight && curr_data.meta.insight.support_price) {
      buy_price += curr_data.meta.insight.support_price;
      buy_count++;
    }

    /*
        status : 만약 샀다면, 매도거나 홀딩상태 제공!
        sell_price : 매도 가능한 저항가격 제공!
        buy : 현재 사야되나 말아야되나 정보 제공 boolean
      */

    for (var id in cluster.workers) {
      cluster.workers[id].send({
        action: "LightWS.send",
        args: [
          "stock/publish",
          {
            code: curr_data.code,
            close: curr_data.close,
            low: curr_data.low,
            real_buy_price: convertToHoga(buy_price / buy_count),
            real_sell_price: convertToHoga(sell_price / count),
          },
          { "stock/subscribe": curr_data.code },
        ],
      });
    }
  });
};

if (cluster.isMaster) {
  console.log("master!!!");
  var CronJob = require("cron").CronJob;
  var collect_job = new CronJob(
    "10 9 * * 1-5",
    collect_job_func,
    null,
    false,
    "Asia/Seoul"
  );
  collect_job.start();

  var collect_job2 = new CronJob(
    "40 16 * * 1-5",
    collect_job_func2,
    null,
    false,
    "Asia/Seoul"
  );
  collect_job2.start();

  // var publish_job = new CronJob(
  //   "*/1 9-15 * * *",
  //   status_job_func,
  //   null,
  //   false,
  //   "Asia/Seoul"
  // );

  // publish_job.start();
} else {
  console.log("no master");
}

module.exports = {
  get: {
    initialize: async (req, res, next) => {
      if (!collecting) {
        let stockList = await collector.getStockList();

        stockList = stockList.filter(
          (d) => d.stock_roe != "N/A" && d.stock_per != "N/A"
        );

        await connector.dao.StockList.drop();
        await connector.dao.StockList.create();
        await connector.dao.StockList.truncate();
        await connector.dao.StockList.batchInsert(stockList);

        const progress_bar = new cliProgress.SingleBar(
          {},
          cliProgress.Presets.shades_classic
        );
        progress_bar.start(stockList.length, 0);

        const nextStep = async (step) => {
          if (step < stockList.length) {
            var item = stockList[step];
            connector.dao.StockData.table_name =
              "stock_data_" + item.stock_code;
            await connector.dao.StockData.create();

            progress_bar.update(step + 1);
            nextStep(step + 1);
          } else {
            progress_bar.stop();
          }
        };
        nextStep(0);
      }
      res.status(200).send("OK");
    },
    clear: async (req, res, next) => {
      // if (!collecting) {
      //   const stockList = await connector.dao.StockList.select({});

      //   connector.dao.StockData.table_name = "stock_data";
      //   await connector.dao.StockData.truncate();

      //   const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      //   progress_bar.start(stockList.length, 0);

      //   const nextStep = async (step) => {
      //     if (step < stockList.length) {
      //       var item = stockList[step];
      //       connector.dao.StockData.table_name = "stock_data_" + item.stock_code;
      //       await connector.dao.StockData.truncate();

      //       progress_bar.update(step + 1);
      //       nextStep(step + 1);
      //     } else {
      //       progress_bar.stop();
      //     }
      //   }
      //   nextStep(0);
      // }
      res.status(200).send("OK");
    },
    collect: async (req, res, next) => {
      if (!collecting) {
        collecting = true;
        const collect_job_func = async () => {
          // const data = new connector.types.StockData(connector.database);
          // await data.truncate();
          const code = req.query.code ? { stock_code: req.query.code } : {};
          const days = req.query.days ? parseInt(req.query.days) : 5;

          collectFunc(code, days);
        };

        if (req.query.cron) {
          var CronJob = require("cron").CronJob;
          var collect_job = new CronJob(
            "5 9-16 * * 1-5",
            collect_job_func,
            null,
            false,
            "Asia/Seoul"
          );
          collect_job.start();
        } else {
          collect_job_func();
        }
      }
      res.status(200).send("OK");
    },
    suggest: async (req, res, next) => {
      const stockList = new connector.types.StockData(connector.database);
      const stockData = new connector.types.StockData(connector.database);
      const dates = await stockList
        .getTable()
        .groupBy("date")
        .orderBy("date", "desc")
        .limit(60);

      let origin_data = await stockList
        .getTable()
        .from(function () {
          this.from(stockList.table_name)
            .where("date", "<=", dates[0].date)
            .andWhere("date", ">=", dates[dates.length - 1].date)
            .orderBy("date", "desc");
        })
        .groupBy("code")
        .orderBy("volume", "desc");

      var ret = {};
      var count = 0;
      console.log(origin_data.length);
      for (var i = 0; i < origin_data.length; i++) {
        if (count == 99) break;
        var d = origin_data[i];
        d["meta"] = JSON.parse(d.meta);
        if (d.volume > 0) {
          stockData.table_name = "stock_data_" + d.code;
          let old_data = await stockData
            .getTable()
            .andWhere("date", ">", d.date)
            .orderBy("date", "desc");

          var notyet = true;
          var reach = false;
          var prev_datum;
          for (var j = 0; j < old_data.length; j++) {
            var datum = old_data[j];
            datum["meta"] = JSON.parse(datum.meta);

            if (prev_datum) {
              if (
                notyet &&
                prev_datum.meta.recent_trend < 0 &&
                datum.meta.recent_trend > 0
              ) {
                // already buy
                notyet = false;
              }
            }

            if (!reach && datum.close / d.close > 1.03) {
              reach = true;
            }
            prev_datum = datum;
          }

          if (old_data.length >= 0 && notyet && !reach) {
            ret[d.code] = {
              Code: d.code,
              Name: d.meta.stock_name,
              Close: d.close,
              Low: d.low,
              BuyPrice: convertToHoga(d.meta.insight.support_price),
              TradePower: 0,
              IsBuy: false,
              Date: d.meta.date,
              Type: d.marker,
              IsToday: old_data.length <= 2,
            };
            count++;
          }
        }
      }

      res.status(200).send(ret);
    },
    train_list: async (req, res, next) => {
      const stockList = new connector.types.StockData(connector.database);
      const stockData = new connector.types.StockData(connector.database);
      const list = await stockList
        .getTable()
        .andWhere("date", "<=", moment().add(-60).format("YYYY-MM-DD"))
        .orderBy("date", "desc");

      // for(var item of list) {
      //   stockData.table_name = "stock_data_" + item.code;
      //   let old_data = await stockData
      //     .getTable()
      //     .andWhere("date", "<=", item.date)
      //     .orderBy("date", "desc")
      //     .limit(200)

      //   if(old_data.length == 200) {
      //     old_data.map((d) => {
      //       d.meta = JSON.parse(d.meta)
      //       return d
      //     })
      //     item.chartData = old_data
      //   }
      // }

      res.status(200).send(list);
    },
    manual: async (req, res, next) => {
      const stockList = new connector.types.StockData(connector.database);
      const stockData = new connector.types.StockData(connector.database);
      const dates = await stockList
        .getTable()
        .groupBy("date")
        .orderBy("date", "desc")
        .limit(40);

      let origin_data = await stockList
        .getTable()
        .from(function () {
          this.from(stockList.table_name)
            .where("date", "<=", dates[0].date)
            .andWhere("date", ">=", dates[dates.length - 1].date)
            .orderBy("date", "desc");
        })
        .groupBy("code")
        .orderBy("volume", "desc");

      var ret = {};
      var count = 0;
      console.log(origin_data.length);
      for (var i = 0; i < origin_data.length; i++) {
        var d = origin_data[i];
        d["meta"] = JSON.parse(d.meta);
        if (d.volume > 0) {
          stockData.table_name = "stock_data_" + d.code;
          let old_data = await stockData
            .getTable()
            .andWhere("date", ">", d.date)
            .orderBy("date", "desc");

          var notyet = false;
          var reach = true;
          var prev_datum;
          for (var j = 0; j < old_data.length; j++) {
            var datum = old_data[j];
            datum["meta"] = JSON.parse(datum.meta);

            // if (prev_datum) {
            //   if (
            //     notyet &&
            //     prev_datum.meta.recent_trend < 0 &&
            //     datum.meta.recent_trend > 0
            //   ) {
            //     // already buy
            //     notyet = false;
            //   }
            // }

            if (reach && datum.close / d.close > 1.02) {
              reach = false;
            }
            prev_datum = datum;
          }

          if (old_data.length >= 0 && (!reach || notyet)) {
            ret[d.code] = {
              Code: d.code,
              Name: d.meta.stock_name,
              Close: d.close,
              Low: d.low,
              BuyPrice: convertToHoga(d.meta.insight.support_price),
              TradePower: 0,
              IsBuy: false,
              Date: d.meta.date,
              Type: d.marker,
              IsToday: old_data.length <= 0,
            };
            count++;
          }
        }
      }

      res.status(200).send(ret);
    },
    status: async (req, res, next) => {
      // 최종 매도에 대한 결정 및 가격 제공 ( 테스트 필요함. )
      let ret;
      const code = req.query.code;
      const hold = req.query.buy;
      const power = parseFloat(req.query.power);
      const req_date = req.query.date
        ? new Date(req.query.date).getTime() - 32400000
        : new Date(moment().format("YYYY-MM-DD")).getTime() - 32400000;

      try {
        const stockData = new connector.types.StockData(connector.database);

        stockData.table_name = "stock_data_" + code;

        let ddd = await stockData
          .getTable()
          .where("marker", "like", "%매수%")
          .andWhere("code", "=", code)
          .orderBy("date", "desc")
          .limit(1);

        await collectFunc({ stock_code: code }, 1);

        let data = await stockData.getTable().orderBy("date", "desc").limit(3);

        let curr_data = data[data.length - 3];
        curr_data["meta"] = JSON.parse(curr_data["meta"]);

        let prev_data = data[data.length - 2];
        prev_data["meta"] = JSON.parse(prev_data["meta"]);

        let old_data = data[data.length - 1];
        old_data["meta"] = JSON.parse(old_data["meta"]);

        const suggest_data = ddd.length > 0 ? ddd[0] : old_data;

        var _water_buy =
          curr_data.volume > 0 &&
          prev_data.volume >= old_data.volume &&
          old_data.meta.recent_trend < 0 &&
          prev_data.meta.recent_trend > 0 &&
          (suggest_data.close + prev_data.close) / 2 >= curr_data.low;

        // 추매용
        const srline =
          curr_data.volume > 0 &&
          prev_data.volume >= old_data.volume &&
          curr_data.low <= (suggest_data.close + prev_data.close) / 2 &&
          curr_data.meta.insight.future_resist >=
            old_data.meta.insight.future_support &&
          prev_data.meta.insight.support > old_data.meta.insight.resist &&
          old_data.meta.insight.support <= 1
            ? true
            : false;

        // 물타기용!!
        const mfiline =
          curr_data.volume > 0 &&
          prev_data.volume >= old_data.volume &&
          curr_data.low <= (suggest_data.close + prev_data.close) / 2 &&
          prev_data.meta.recent_trend < 0 &&
          prev_data.meta.insight.support <= prev_data.meta.insight.resist &&
          old_data.meta.mfi < old_data.meta.step_mfi &&
          prev_data.meta.mfi >= prev_data.meta.step_mfi
            ? true
            : false;

        const moneyline =
          curr_data.volume > 0 &&
          prev_data.volume >= old_data.volume &&
          curr_data.low <= (suggest_data.close + prev_data.close) / 2 &&
          old_data.meta.insight.support <= old_data.meta.insight.resist &&
          prev_data.meta.insight.support > prev_data.meta.insight.resist
            ? true
            : false;

        var _buy = srline || mfiline || moneyline ? true : false;

        if (_water_buy) {
          vases.logger.info(
            "[trading] : " + code + " 바로매수 " + curr_data.meta.mfi
          );
        }

        ret = {
          code: curr_data.code,
          close: curr_data.close,
          low: curr_data.low,
          buy_price: curr_data.close,
          volume_buy: prev_data.volume <= curr_data.volume,
          water_buy: false,
          init_buy: false,
          buy: _water_buy || _buy,
          age:
            ddd.length > 0
              ? moment.duration(moment().diff(moment(ddd[0].date))).asDays()
              : -1,
        };
      } catch (error) {
        console.log(error);
        ret = {
          code: code,
          close: 0,
          low: 0,
          buy_price: 0,
          init_buy: false,
          buy: false,
          water_buy: false,
          age: 0,
        };
      }
      res.status(200).send(ret);
    },
    status_test: async (req, res, next) => {
      const stockList = new connector.types.StockData(connector.database);
      const stockData = new connector.types.StockData(connector.database);
      const dates = await stockList
        .getTable()
        .groupBy("date")
        .orderBy("date", "desc")
        .limit(100);

      let origin_data = await stockList
        .getTable()
        .from(function () {
          this.from(stockList.table_name)
            .where("date", "<=", dates[0].date)
            .andWhere("date", ">=", dates[dates.length - 1].date)
            .orderBy("date", "desc");
        })
        .groupBy("code")
        .orderBy("volume", "desc");

      for (var i = 0; i < origin_data.length; i++) {
        var suggest_data = origin_data[i];
        suggest_data["meta"] = JSON.parse(suggest_data.meta);
        if (suggest_data.volume > 0) {
          stockData.table_name = "stock_data_" + suggest_data.code;
          let virtual_data = await stockData
            .getTable()
            .andWhere("date", ">", suggest_data.date)
            .orderBy("date", "asc");

          if (virtual_data.length >= 3) {
            console.log(suggest_data.code + " started");
            virtual_data = virtual_data.map((d) => {
              return {
                ...d,
                meta: JSON.parse(d.meta),
              };
            });
            for (var j = 0; j < virtual_data.length; j++) {
              const old_data = virtual_data[j];
              const prev_data = virtual_data[j + 1];
              const curr_data = virtual_data[j + 2];
              try {
                if (prev_data && curr_data) {
                  // const prices = [];
                  // if (old_data.meta.insight.support_price)
                  //   prices.push(old_data.meta.insight.support_price);
                  // if (prev_data.meta.insight.support_price)
                  //   prices.push(prev_data.meta.insight.support_price);
                  // if (curr_data.meta.insight.support_price)
                  //   prices.push(curr_data.meta.insight.support_price);

                  var _water_buy =
                    curr_data.volume > 0 &&
                    old_data.meta.recent_trend < 0 &&
                    prev_data.meta.recent_trend > 0 &&
                    (suggest_data.close + prev_data.close) / 2 >= curr_data.low;

                  // 추매용
                  const srline =
                    curr_data.volume > 0 &&
                    curr_data.low <=
                      (suggest_data.close + prev_data.close) / 2 &&
                    prev_data.meta.insight.future_resist >=
                      old_data.meta.insight.future_support &&
                    prev_data.meta.insight.support >
                      old_data.meta.insight.resist &&
                    old_data.meta.insight.support == 0
                      ? true
                      : false;

                  // 물타기용!!
                  const mfiline =
                    curr_data.volume > 0 &&
                    curr_data.low <=
                      (suggest_data.close + prev_data.close) / 2 &&
                    prev_data.meta.recent_trend < 0 &&
                    prev_data.meta.insight.support <=
                      prev_data.meta.insight.resist &&
                    old_data.meta.mfi < old_data.meta.step_mfi &&
                    prev_data.meta.mfi >= prev_data.meta.step_mfi
                      ? true
                      : false;

                  var _buy = srline || mfiline ? true : false;

                  if (_water_buy) {
                    console.log(
                      suggest_data.code +
                        "(워터매수):" +
                        moment(curr_data.date).format("YYYY-MM-DD")
                    );
                  }

                  if (srline) {
                    console.log(
                      suggest_data.code +
                        "(불타기매수): " +
                        moment(curr_data.date).format("YYYY-MM-DD")
                    );
                  }

                  if (mfiline) {
                    console.log(
                      suggest_data.code +
                        "(물타기매수): " +
                        moment(curr_data.date).format("YYYY-MM-DD")
                    );
                  }
                }
              } catch (error) {
                console.log(prev_data);
              }
            }
          }
        }
      }
      // 최종 매도에 대한 결정 및 가격 제공 ( 테스트 필요함. )

      res.status(200).send(true);
    },
    test: async (req, res, next) => {
      // 테스트 : 기간내 5프로 이상 수익 79프로 성공 확인
      const rate = req.query.rate ? parseFloat(req.query.rate) : 105;
      const stockData = new connector.types.StockData(connector.database);
      let origin_data = await stockData.select();

      var success = [];
      var cnt = 0;
      origin_data = origin_data.map(async (d) => {
        let isSuccess = false;
        try {
          d.meta = JSON.parse(d.meta);
          stockData.table_name = "stock_data_" + d.code;

          let future_data = await stockData
            .getTable()
            .andWhere("date", ">", d.date)
            .orderBy("date", "desc");

          if (future_data.length > 60) {
            var buy_price;
            let suggest_price = d.meta.segmentation_avg;
            var prevData;
            for (var i = 0; i < future_data.length; i++) {
              var j = future_data[i];
              j.meta = JSON.parse(j.meta);
              suggest_price = (suggest_price + d.meta.segmentation_avg) / 2;

              if (buy_price) {
                const rate = (j.high / buy_price) * 100;

                if (rate > 103) {
                  isSuccess = true;
                  success.push(true);
                  break;
                }
              }
              // j.meta.recent_trend > 0 &&
              // prevData.meta.recent_trend < 0 &&
              // j.meta.insight.future_resist > j.meta.insight.future_support &&
              // j.meta.insight.support > prevData.meta.insight.resist

              // j.meta.recent_trend > 0 &&
              //   j.meta.insight.support > 0 &&
              //   prevData.meta.insight.support == 0 &&
              //   j.meta.insight.future_resist > j.meta.insight.future_support &&
              //   j.meta.insight.support > prevData.meta.insight.resist
              if (
                prevData &&
                !buy_price &&
                j.meta.insight.support > 0 &&
                prevData.meta.insight.support == 0 &&
                (j.meta.insight.future_resist >
                  prevData.meta.insight.future_resist ||
                  j.meta.insight.future_support <
                    prevData.meta.insight.future_support)
              ) {
                buy_price = j.close;
              }

              prevData = j;
            }

            if (!isSuccess && buy_price) {
              console.log("fail", d.code, moment(d.date).format("YYYY-MM-DD"));
            }

            if (isSuccess && buy_price) {
              // console.log(success.length);
            }
          }
        } catch (error) {}
        cnt++;
        if (cnt == origin_data.length) {
          console.log(success.length, origin_data.length);
        }

        return isSuccess;
      });

      res.status(200).send({});
    },
    test2: async (req, res, next) => {
      // 테스트 : 기간내 5프로 이상 수익 79프로 성공 확인
      const rate = req.query.rate ? parseFloat(req.query.rate) : 105;
      const stockData = new connector.types.StockData(connector.database);
      let origin_data = await stockData.select();

      origin_data = origin_data.map((d) => {
        d.meta = JSON.parse(d.meta);

        return d;
      });

      var good_list = origin_data.filter((d) => d.result > rate);
      var bad_list = origin_data.filter((d) => d.result < rate);

      console.log(
        good_list.length,
        origin_data.filter((d) => d.result).length,
        _.mean(good_list.map((d) => d.result))
      );
      res.status(200).send(bad_list);
    },
    favorite: async (req, res, next) => {
      const stockFavorite = new connector.types.StockFavorite(
        connector.database
      );
      const data = await stockFavorite.select({
        user_id: req.session.passport.user.id,
      });
      res.status(200).send(data.map((d) => d.code));
    },
    model: async (req, res, next) => {
      res.status(200).send();
    },
  },
  post: {
    check: async (req, res, next) => {
      var ret = "대기";
      let prev_result;
      try {
        var data = [];
        var insights = [];

        for (var i = req.body.data.length - 1; i >= 0; i--) {
          let result = {
            trend_cnt: 0,
            recent_trend: 0,
            total_trend: 0,
            curr_trend: 0,
            init_trend: 0,
            segmentation: [],
            upward_point: [],
            downward_point: [],
          };

          var _dd = req.body.data.slice(0, req.body.data.length - i);
          analysis.segmentation(_dd, result, "close");

          let insight = analysis.cross_point(
            result,
            _dd[_dd.length - 1],
            "close"
          );
          insight["date"] = _dd[_dd.length - 1].date;

          data.push(
            (insight.support -
              insight.resist +
              result.upward_point +
              result.downward_point +
              result.segmentation) *
              result.curr_trend *
              result.init_trend
          );
          insights.push(insight);

          if (prev_result) {
            result.trend_cnt = prev_result.trend_cnt;
            result.total_trend = prev_result.total_trend;
            result.recent_trend = prev_result.recent_trend;
            if (
              prev_result.curr_trend == result.curr_trend &&
              prev_result.segmentation.length - result.segmentation.length > 0
            ) {
              result.recent_trend = result.curr_trend > 0 ? +1 : -1;
              if (prev_result.recent_trend != result.recent_trend) {
                result.trend_cnt = 0;
              }
              result.trend_cnt += result.curr_trend > 0 ? +1 : -1;
              result.total_trend += result.curr_trend > 0 ? +1 : -1;
            }
            result["prev_trend"] = prev_result.recent_trend;
            result["prev_curr_trend"] = prev_result.curr_trend;
          }

          prev_result = result;
        }
        if (
          // ((insights[insights.length - 3].support ||
          //   insights[insights.length - 3].resist ||
          //   insights[insights.length - 3].future_resist ||
          //   insights[insights.length - 3].future_support) &&
          //   !insights[insights.length - 2].support &&
          //   !insights[insights.length - 2].resist &&
          //   !insights[insights.length - 2].future_resist &&
          //   !insights[insights.length - 2].future_support) ||
          (prev_result.recent_trend > 0 &&
            prev_result.prev_trend < 0 &&
            insights[insights.length - 3].support >
              insights[insights.length - 2].support) ||
          (insights[insights.length - 3].future_support <=
            insights[insights.length - 3].future_resist &&
            insights[insights.length - 2].future_support >
              insights[insights.length - 2].future_resist)
        ) {
          ret = "매도";
          vases.logger.info(
            "[trading] : " +
              req.body.code +
              " 신규 매도 룰 발생!! " +
              insights[insights.length - 2].support +
              "/" +
              insights[insights.length - 2].resist +
              "/" +
              insights[insights.length - 2].future_resist +
              "/" +
              insights[insights.length - 2].future_support
          );
        } else if (
          insights[insights.length - 2].future_support <=
            insights[insights.length - 2].future_resist &&
          insights[insights.length - 3].support == 0 &&
          insights[insights.length - 2].support > 0 &&
          insights[insights.length - 2].support >=
            insights[insights.length - 2].resist
        ) {
          ret = "역추세매수";
          vases.logger.info(
            "[trading] : " +
              req.body.code +
              " 역추세매매 룰 매수 발생!! " +
              insights[insights.length - 2].support +
              "/" +
              insights[insights.length - 2].resist +
              "/" +
              insights[insights.length - 2].future_resist +
              "/" +
              insights[insights.length - 2].future_support
          );
        } else if (
          insights[insights.length - 3].support <
            insights[insights.length - 3].resist &&
          insights[insights.length - 2].support >=
            insights[insights.length - 2].resist &&
          insights[insights.length - 2].future_resist >=
            insights[insights.length - 2].future_support
        ) {
          ret = "매수";
          vases.logger.info(
            "[trading] : " +
              req.body.code +
              " 신규 룰 매수 발생!! " +
              insights[insights.length - 2].support +
              "/" +
              insights[insights.length - 2].resist +
              "/" +
              insights[insights.length - 2].future_resist +
              "/" +
              insights[insights.length - 2].future_support
          );
        } else {
          vases.logger.info(
            "[trading] : " +
              req.body.code +
              " 대기 " +
              prev_result.recent_trend +
              "/" +
              prev_result.curr_trend +
              "/" +
              insights[insights.length - 2].support +
              "/" +
              insights[insights.length - 2].resist +
              "/" +
              insights[insights.length - 2].future_resist +
              "/" +
              insights[insights.length - 2].future_support
          );
        }
      } catch (error) {
        console.log(error);
      }

      if (prev_result) {
        res.status(200).send(ret + "/" + prev_result.trend_cnt);
      } else {
        console.log(req.body.code);
        res.status(200).send(ret + "/" + 0);
      }
    },
  },
};
