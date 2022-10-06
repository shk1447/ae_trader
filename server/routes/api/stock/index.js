const collector = require("../../modules/NaverFinance");
const analysis = require("../../modules/Analysis");
const connector = require("../../../connector");

const cliProgress = require("cli-progress");
const moment = require("moment");

const cluster = require("cluster");

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

// const model_path = path.resolve(
//   process.env.root_path,
//   "../experiment/ae_model/model.json"
// );
// let best_model;
// tf.loadLayersModel("file://" + model_path).then((model) => {
//   best_model = model;
// });

const collectFunc = async (code, days) => {
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

        // console.log(data)

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
              };

              /*
              spanA > spanB 양운
              spanA < spanB 음운
              conversion 전환선
              base 기준선
            */

              result["meta"] = meta;

              if (prev_result) {
                result.meta.trend_cnt = prev_result.meta.trend_cnt;
                result.meta.total_trend = prev_result.meta.total_trend;
                result.meta.recent_trend = prev_result.meta.recent_trend;

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
                  if (result.meta.mfi) result.meta.prev_mfi = result.meta.mfi;
                  result.meta.trend_cnt += result.meta.curr_trend > 0 ? +1 : -1;
                  result.meta.total_trend +=
                    result.meta.curr_trend > 0 ? +1 : -1;
                }

                if (
                  result.meta.recent_trend < 0 &&
                  prev_result.meta.curr_trend < 0 &&
                  result.meta.curr_trend > 0 &&
                  ((!prev_result.meta.insight.support_price &&
                    insight.support_price) ||
                    (prev_result.meta.insight.resist_price &&
                      !insight.resist_price)) &&
                  insight.support >= prev_result.meta.insight.resist &&
                  insight.support + insight.resist >=
                    insight.future_support + insight.future_resist
                ) {
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

const collect_job_func = async () => {
  // const data = new connector.types.StockData(connector.database);
  // await data.truncate();
  const code = {};
  const days = 5;
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
    "51 8,9,14,15 * * 1-5",
    collect_job_func,
    null,
    false,
    "Asia/Seoul"
  );
  collect_job.start();

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
        .limit(40);

      let origin_data = await stockList
        .getTable()
        .from(function () {
          this.from(stockList.table_name)
            .where("date", "<=", dates[0].date)
            .andWhere("date", ">=", dates[dates.length - 1].date)
            .orderBy("date", "desc");
        })
        .groupBy("code");

      var ret = {};
      for (var i = 0; i < origin_data.length; i++) {
        var d = origin_data[i];
        d["meta"] = JSON.parse(d.meta);
        if (d.volume > 0) {
          stockData.table_name = "stock_data_" + d.code;
          let old_data = await stockData
            .getTable()
            .andWhere("date", ">", d.date)
            .orderBy("date", "asc");

          var notyet = true;
          var prev_datum;
          for (var j = 0; j < old_data.length; j++) {
            var datum = old_data[j];
            datum["meta"] = JSON.parse(datum.meta);
            if (prev_datum) {
              if (
                prev_datum.meta.recent_trend < 0 &&
                datum.meta.recent_trend > 0
              ) {
                // already buy
                notyet = false;
                break;
              }
            }
            prev_datum = datum;
          }

          if (
            notyet &&
            old_data.length > 0 &&
            old_data[old_data.length - 1].close <= d.close
          ) {
            var IsToday = moment(d.meta.date) >= moment().add("day", -1);
            ret[d.code] = {
              Code: d.code,
              Name: d.meta.stock_name,
              Close: d.close,
              Low: d.low,
              BuyPrice: convertToHoga(d.meta.insight.support_price),
              TradePower: 0,
              IsBuy: false,
              Date: d.meta.date,
              IsToday: IsToday,
            };
          }
        }
      }

      res.status(200).send(ret);
    },
    manual: async (req, res, next) => {
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
        .groupBy("code");

      var ret = {};

      for (var i = 0; i < origin_data.length; i++) {
        var d = origin_data[i];
        d["meta"] = JSON.parse(d.meta);
        if (d.volume > 0) {
          stockData.table_name = "stock_data_" + d.code;
          await collectFunc({ stock_code: d.code }, 2);
          let old_data = await stockData
            .getTable()
            .andWhere("date", ">", d.date)
            .orderBy("date", "desc");

          var notyet = true;
          var prev_datum;
          for (var j = 0; j < old_data.length; j++) {
            var datum = old_data[j];
            datum["meta"] = JSON.parse(datum.meta);
            if (prev_datum) {
              if (
                prev_datum.meta.recent_trend < 0 &&
                datum.meta.recent_trend > 0
              ) {
                // already buy
                notyet = false;
                break;
              }
            }
            prev_datum = datum;
          }

          if (notyet && old_data.length > 0) {
            if (old_data[old_data.length - 1].meta.recent_trend > 0) {
              ret[d.code] = {
                buy: true,
              };
            }
          }
        }
      }

      res.status(200).send(ret);
    },
    status: async (req, res, next) => {
      // 최종 매도에 대한 결정 및 가격 제공 ( 테스트 필요함. )
      let ret;
      const code = req.query.code;
      const power = parseFloat(req.query.power);
      const req_date = req.query.date
        ? new Date(req.query.date).getTime() - 32400000
        : new Date(moment().format("YYYY-MM-DD")).getTime() - 32400000;

      try {
        const stockData = new connector.types.StockData(connector.database);
        let _suggest_data = await stockData
          .getTable()
          .where("code", code)
          .orderBy("date", "desc")
          .limit(1);

        let suggest_data = _suggest_data[0];
        suggest_data["meta"] = JSON.parse(suggest_data["meta"]);

        stockData.table_name = "stock_data_" + code;

        await collectFunc({ stock_code: code }, 2);

        let data = await stockData.getTable().orderBy("date", "desc").limit(2);

        let curr_data = data[data.length - 2];
        curr_data["meta"] = JSON.parse(curr_data["meta"]);

        let prev_data = data[data.length - 1];
        prev_data["meta"] = JSON.parse(prev_data["meta"]);

        ret = {
          code: curr_data.code,
          close: curr_data.close,
          low: curr_data.low,
          buy_price: curr_data.close,
          volume_buy: 0,
          water_buy:
            curr_data.volume > 0 &&
            curr_data.meta.recent_trend < 0 &&
            prev_data.meta.curr_trend < 0 &&
            curr_data.meta.curr_trend > 0 &&
            curr_data.close > curr_data.meta.segmentation_avg &&
            prev_data.close < prev_data.meta.segmentation_avg
              ? true
              : false,
          init_buy: false,
          buy:
            curr_data.volume > 0 &&
            prev_data.meta.recent_trend < 0 &&
            curr_data.meta.recent_trend > 0
              ? true
              : false,
        };
      } catch (error) {
        ret = {
          code: code,
          close: 0,
          low: 0,
          buy_price: 0,
          init_buy: false,
          buy: false,
          water_buy: false,
        };
      }
      res.status(200).send(ret);
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

              if (
                prevData &&
                !buy_price &&
                j.meta.recent_trend > 0 &&
                prevData.meta.recent_trend < 0
              ) {
                buy_price = j.close;
              }

              prevData = j;
            }

            if (!isSuccess && buy_price) {
              console.log("fail");
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

        for (var i = 99; i >= 0; i--) {
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
          }

          prev_result = result;
        }
        if (
          (prev_result.prev_trend > 0 &&
            prev_result.recent_trend < 0 &&
            !(
              insights[insights.length - 1].support >
              insights[insights.length - 1].resist
            )) ||
          (prev_result.recent_trend < 0 &&
            insights[insights.length - 2].resist <
              insights[insights.length - 1].resist)
        ) {
          ret = "매도";
          vases.logger.info(
            "[trading] : " + req.body.code + "신규 매도 룰 발생!!"
          );
        } else if (
          prev_result.prev_trend < 0 &&
          prev_result.recent_trend > 0 &&
          (insights[insights.length - 1].support >
            insights[insights.length - 1].resist ||
            insights[insights.length - 2].support <
              insights[insights.length - 1].support)
        ) {
          ret = "매수";
          vases.logger.info(
            "[trading] : " + req.body.code + " 신규 룰 매수 발생!!"
          );
        } else {
          vases.logger.info(
            "[trading] : " +
              req.body.code +
              " 대기" +
              prev_result.prev_trend +
              "/" +
              prev_result.recent_trend +
              "/" +
              insights[insights.length - 1].support +
              "/" +
              insights[insights.length - 1].resist
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
