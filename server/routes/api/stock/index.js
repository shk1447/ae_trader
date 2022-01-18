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
  const stockList = await connector.dao.StockList.select(code);

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

        for (let i = all_data.length - data.length; i < all_data.length; i++) {
          let row = all_data[i];

          row["code"] = item.stock_code;
          try {
            const getChangeRate = (arr) => {
              var ret_arr = [];
              if (arr.length > 0) {
                arr.reduce((prev, curr) => {
                  ret_arr.push(curr - prev);
                  return curr;
                });
              }
              if (ret_arr.length > 1) {
                ret_arr = getChangeRate(ret_arr);
              }
              return ret_arr;
            };

            var period_arr = [...all_data].slice(i - 20, i).map((d) => {
              var day_power = d.close - d.open;
              var down_power = d.high - Math.min(d.open, d.close);
              var up_power = Math.max(d.open, d.close) - d.low;
              var power =
                (up_power - down_power + day_power) *
                (d.volume / item.stock_total);
              return power;
            });
            const long_power = _.mean(period_arr);
            const long_change_rate = getChangeRate(period_arr);
            const curr_power = _.mean(
              [...all_data].slice(i - 3, i).map((d) => {
                var day_power = d.close - d.open;
                var down_power = d.high - Math.min(d.open, d.close);
                var up_power = Math.max(d.open, d.close) - d.low;
                var power =
                  (up_power - down_power + day_power) *
                  (d.volume / item.stock_total);
                return power;
              })
            );

            let result = {
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
              curr_power: curr_power,
              long_power: long_power,
              long_change_rate: long_change_rate,
              date: moment(row.date).format("YYYY-MM-DD"),
            };

            let clouds = new IchimokuCloud({
              high: [...all_data].slice(i - 77, i).map((d) => d.high),
              low: [...all_data].slice(i - 77, i).map((d) => d.low),
              conversionPeriod: 9,
              basePeriod: 26,
              spanPeriod: 52,
              displacement: 26,
            }).result;

            let bands = new BollingerBands({
              period: 20,
              stdDev: 2,
              values: [...all_data].slice(i - 20, i).map((d) => d.close),
            }).result;
            if (bands.length > 0) {
              let band_data = bands;
              meta["band"] = band_data[0];
            }

            if (clouds.length > 0) {
              meta["cloud"] = {
                spanA: clouds[0].spanA,
                spanB: clouds[0].spanB,
                conversion: clouds[clouds.length - 1].conversion,
                base: clouds[clouds.length - 1].base,
              };
            }
            /*
              spanA > spanB 양운
              spanA < spanB 음운
              conversion 전환선
              base 기준선
            */

            result["meta"] = meta;

            if (prev_result) {
              if (
                !prev_result.meta.insight.support_price &&
                insight.support_price &&
                insight.support > insight.resist
              ) {
                row["marker"] = "매수";
                let futures = all_data.slice(i + 1, i + 61);
                if (futures.length == 60) {
                  var max_point = [...futures].sort(
                    (a, b) => b.high - a.high
                  )[0];
                  var high_rate = (max_point.high / row.close) * 100;

                  row["result"] = high_rate;
                }
                recommended_rows.push(row);
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
  const code = {};
  const days = 2;

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
    "50 8-15 * * 1-5",
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
      const req_date = req.query.date
        ? new Date(req.query.date).getTime() - 32400000
        : new Date(moment().format("YYYY-MM-DD")).getTime() - 32400000;
      // var week = new Array(
      //   "일요일",
      //   "월요일",
      //   "화요일",
      //   "수요일",
      //   "목요일",
      //   "금요일",
      //   "토요일"
      // );
      // const day_label = (req_date.getDay() % 6) - 4;
      const query_date = moment(req_date).add(-7, "day").unix() * 1000;

      const stockList = new connector.types.StockData(connector.database);
      let origin_data = await stockList
        .getTable()
        .where("date", "<=", req_date)
        .andWhere("date", ">=", query_date);

      var ret = {};
      origin_data.forEach((d) => {
        d["meta"] = JSON.parse(d.meta);
        ret[d.code] = {
          Code: d.code,
          Close: d.close,
          BuyPrice: convertToHoga(d.meta.insight.support_price),
          TradePower: 0,
          IsBuy: false,
          Date: d.meta.date,
        };
      });
      res.status(200).send(ret);
    },
    status: async (req, res, next) => {
      // 최종 매도에 대한 결정 및 가격 제공 ( 테스트 필요함. )
      const code = req.query.code;
      const req_date = req.query.date
        ? new Date(req.query.date).getTime() - 32400000
        : new Date(moment().format("YYYY-MM-DD")).getTime() - 32400000;

      const stockData = new connector.types.StockData(connector.database);
      stockData.table_name = "stock_data_" + code;

      let old_data = await stockData
        .getTable()
        .where("date", "<=", req_date)
        .orderBy("date", "desc")
        .limit(1);

      let prev_data = old_data[old_data.length - 1];

      await collectFunc({ stock_code: code }, 1);

      let data = await stockData
        .getTable()
        .where("date", "<=", req_date)
        .orderBy("date", "desc")
        .limit(1);

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

      // process.send({
      //   action: "LightWS.send",
      //   args: [
      //     "stock",
      //     { publish: [{ code: curr_data.code, close: curr_data.close }] },
      //     { subscribe: "000020" },
      //   ],
      // });
      sell_price = convertToHoga(sell_price / count);
      buy_price = convertToHoga(buy_price / buy_count);
      res.status(200).send({
        code: curr_data.code,
        close: curr_data.close,
        low: curr_data.low,
        sell_price: sell_price,
        buy_price: buy_price,
        buy:
          curr_data.meta.insight.support >= curr_data.meta.insight.resist &&
          ((prev_data.close < buy_price*1.03 &&
          buy_price <= curr_data.close) || (prev_data.close < sell_price &&
            sell_price*0.97 <= curr_data.close)),
        sell:
          curr_data.meta.insight.support <= curr_data.meta.insight.resist &&
          prev_data.close >= sell_price &&
          sell_price > curr_data.close,
      });
    },
    test: async (req, res, next) => {
      // 테스트 : 기간내 5프로 이상 수익 79프로 성공 확인
      const rate = req.query.rate ? parseFloat(req.query.rate) : 105;
      const stockData = new connector.types.StockData(connector.database);
      const origin_data = await stockData.select();

      var good_list = origin_data.filter((d) => d.result > rate);

      console.log(
        good_list.length,
        origin_data.filter((d) => d.result).length,
        _.mean(good_list.map((d) => d.result))
      );
      res.status(200).send();
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
  },
  post: {
    check: async (req, res, next) => {
      var ret = "대기";
      var prev_result;
      for (var i = req.body.data.length - 2; i < req.body.data.length; i++) {
        let result = {
          curr_trend: 0,
          init_trend: 0,
          segmentation: [],
          upward_point: [],
          downward_point: [],
        };

        analysis.segmentation(
          [...req.body.data].splice(0, i + 1),
          result,
          "close"
        );
        let insight = analysis.cross_point(
          result,
          req.body.data[req.body.data.length - 1],
          "close"
        );
        if (prev_result) {
          if (
            !prev_result.support_price &&
            insight.support_price &&
            insight.support >= insight.resist
          ) {
            // 매수
            ret = "매수";
          }

          if (
            !prev_result.resist_price &&
            insight.resist_price &&
            insight.support <= insight.resist
          ) {
            // 매도
            ret = "매도";
          }
        }

        prev_result = insight;
      }
      console.log(
        req.body.code,
        ret,
        prev_result.support >= prev_result.resist,
        prev_result.support_price,
        prev_result.resist_price
      );
      res.status(200).send(ret);
    },
  },
};
