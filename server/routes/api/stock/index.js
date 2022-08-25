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
  OBV,
  SMA,
} = require("technicalindicators");
const path = require("path");
const tf = require("@tensorflow/tfjs-node-gpu");
const dfd = require("danfojs-node");
const { disableDeprecationWarnings } = require("@tensorflow/tfjs-node-gpu");
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

const model_path = path.resolve(
  process.env.root_path,
  "../experiment/ae_model/model.json"
);
let best_model;
tf.loadLayersModel("file://" + model_path).then((model) => {
  best_model = model;
});

const collectFunc = async (code, days) => {
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
        let prev_sell_signal;

        for (let i = all_data.length - data.length; i < all_data.length; i++) {
          let row = { ...all_data[i] };

          row["code"] = item.stock_code;
          try {
            let result = {
              volume: row.volume,
              curr_trend: 0,
              init_trend: 0,
              segmentation: [],
              upward_point: [],
              downward_point: [],
            };

            analysis.segmentation(
              [...all_data].splice(0, i + 1),
              result,
              "close"
            );

            let insight = analysis.cross_point(result, row, "close");

            result.segmentation.sort((a, b) => a.from.date - b.from.date);
            result.upward_point.sort((a, b) => a.date - b.date);
            result.downward_point.sort((a, b) => a.date - b.date);

            let meta = {
              curr_trend: result.curr_trend,
              init_trend: result.init_trend,
              segmentation: result.segmentation.length,
              upward_point: result.upward_point.length,
              downward_point: result.downward_point.length,
              insight: insight,
              date: moment(row.date).format("YYYY-MM-DD"),
            };

            /*
              spanA > spanB 양운
              spanA < spanB 음운
              conversion 전환선
              base 기준선
            */

            result["meta"] = meta;
            all_data[i]["meta"] = meta;

            if (i > 100) {
              let scaler = new dfd.StandardScaler();
              const dataset = all_data
                .slice(i - 100, i)
                .sort((a, b) => b.date - a.date);
              let df = new dfd.DataFrame(
                dataset.map((k) => {
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
              const test_data = [];
              if (dataset.length == 100) {
                test_data.push({
                  code: item.stock_code,
                  data: df_enc.values,
                  meta: dataset[0].meta,
                });

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
                    buy: !d.meta.insight.future_support_price,
                  };
                });

                if (result_arr.length > 0) {
                  row["label"] = result_arr[0].best;
                }

                var goods = result_arr.filter(
                  (d) => d.best <= 0.89891517162323
                );

                if (goods.length > 0) {
                  row["marker"] = "매수";

                  let futures = all_data.slice(i + 1, i + 61);
                  if (futures.length > 0) {
                    var max_point = [...futures].sort(
                      (a, b) => b.high - a.high
                    )[0];
                    var high_rate = (max_point.high / row.close) * 100;

                    row["result"] = high_rate;
                  } else {
                    row["result"] = 100;
                  }

                  recommended_rows.push(row);
                }
              }
            }

            row["meta"] = JSON.stringify(meta);
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
    }
  };
  nextStep(0);
};

const collect_job_func = async () => {
  // const data = new connector.types.StockData(connector.database);
  // await data.truncate();
  const code = {};
  const days = 21;
  const stockData = new connector.types.StockData(connector.database);
  var date = moment().format("YYYY-MM-DD 00:00:00");
  const today_unix = moment(date).unix() * 1000;

  await stockData.getTable().where({ date: today_unix }).del();

  collectFunc(code, days);
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
    "58 8,14,15 * * 1-5",
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

      const dates = await stockList
        .getTable()
        .groupBy("date")
        .orderBy("date", "desc")
        .limit(20);

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
      origin_data
        .filter((d) => {
          return d.result <= 102;
        })
        .forEach((d) => {
          if (d.volume > 0) {
            d["meta"] = JSON.parse(d.meta);
            var IsToday = moment(d.meta.date) >= moment().add("day", -7);
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
        });
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

        let old_data = await stockData
          .getTable()
          .andWhere("date", ">=", suggest_data.date)
          .orderBy("date", "desc");

        var support_count = 0;
        var support_price = 0;
        var avg_volume = 0;
        var avg_count = 0;
        old_data.forEach((datum) => {
          datum["meta"] = JSON.parse(datum["meta"]);
          if (datum.meta.insight.support_price) {
            support_price += datum.meta.insight.support_price;
            support_count++;
          }
          avg_volume += datum["volume"];
          avg_count++;
        });
        support_price = support_price / support_count;
        avg_volume = avg_volume / avg_count;

        await collectFunc({ stock_code: code }, 21);

        let data = await stockData.getTable().orderBy("date", "desc").limit(2);

        let curr_data = data[data.length - 2];
        curr_data["meta"] = JSON.parse(curr_data["meta"]);

        let prev_data = data[data.length - 1];
        prev_data["meta"] = JSON.parse(prev_data["meta"]);

        init_support_price = Math.abs(
          convertToHoga((support_price + curr_data.close) / 2)
        );
        support_price = Math.abs(convertToHoga(support_price));
        var volume_buy =
          Math.ceil(((prev_data.volume / avg_volume) * power) / 10) / 10;
        if (volume_buy > 5) {
          vases.logger.info(
            "[overflow volume] : " + code + "(" + volume_buy + ")"
          );
        }

        ret = {
          code: curr_data.code,
          close: curr_data.close,
          low: curr_data.low,
          buy_price: support_price,
          volume_buy: volume_buy > 5 ? 5 : volume_buy,
          water_buy:
            suggest_data.close >= curr_data.close &&
            curr_data.volume / avg_volume >= 1 &&
            power >= 100 &&
            curr_data.close - curr_data.low >=
              curr_data.high - curr_data.close &&
            ((curr_data.low <= support_price &&
              support_price < curr_data.close) ||
              (curr_data.low <= init_support_price &&
                init_support_price < curr_data.close)) &&
            support_count > 1 &&
            curr_data.volume > 0,
          init_buy:
            suggest_data.close >= curr_data.close &&
            curr_data.volume / avg_volume >= 0.8 &&
            !prev_data.meta.insight.support_price &&
            curr_data.meta.insight.support_price &&
            curr_data.volume > 0
              ? true
              : false,
          buy:
            suggest_data.close >= curr_data.close &&
            curr_data.volume / avg_volume >= 0.8 &&
            !prev_data.meta.insight.support_price &&
            curr_data.meta.insight.support_price &&
            curr_data.volume > 0
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

      origin_data = origin_data.map((d) => {
        d.meta = JSON.parse(d.meta);

        return d;
      });

      var good_list = origin_data.filter((d) => d.result > rate);
      var bad_list = origin_data.filter((d) => d.result > rate);

      console.log(
        good_list.length,
        origin_data.filter((d) => d.result).length,
        _.mean(good_list.map((d) => d.result))
      );
      res.status(200).send({});
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
      try {
        var data = [];
        var insights = [];

        for (var i = 1; i <= 100; i++) {
          let result = {
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
        }

        let scaler = new dfd.StandardScaler();
        let df = new dfd.DataFrame(data);

        scaler.fit(df);
        let df_enc = scaler.transform(df);
        const test_data = [];

        test_data.push({
          data: df_enc.values,
        });

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
            best: best_array[idx],
          };
        });

        var goods = result_arr.filter((d) => d.best <= 0.89891517162323);

        if (goods.length > 0) {
          ret = "매수";
          vases.logger.info(
            "[trading_model] : " +
              req.body.code +
              "(" +
              ret +
              ") - " +
              req.body.volume_buy
          );
        } else {
          if (
            isNaN(insights[0].future_resist_price) &&
            !isNaN(insights[0].future_support_price)
          ) {
            ret = "매도";
          } else if (
            !isNaN(insights[1].resist_price) &&
            isNaN(insights[0].resist_price) &&
            !isNaN(insights[0].future_support_price)
          ) {
            ret = "매도";
          } else if (
            isNaN(insights[0].resist_price) &&
            isNaN(insights[0].future_support_price) &&
            !isNaN(insights[1].future_support_price)
          ) {
            ret = "매수";
          } else {
            if (
              !isNaN(insights[0].support_price) &&
              isNaN(insights[0].resist_price) &&
              insights[0].support >= insights[0].resist &&
              insights[1].support < insights[1].resist
            ) {
              ret = "매수";
            }
          }
        }
      } catch (error) {
        console.log(error);
      }

      if (ret.includes("매수")) {
        vases.logger.info(
          "[trading] : " +
            req.body.code +
            "(" +
            ret +
            ") - " +
            req.body.volume_buy
        );
      } else {
        vases.logger.info(
          "[trading] : " +
            req.body.code +
            "(" +
            ret +
            ") - " +
            req.body.volume_buy
        );
      }

      res.status(200).send(ret);
    },
  },
};
