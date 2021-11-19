const collector = require('./modules/NaverFinance');
const analysis = require('./modules/Analysis');
const connector = require('../../../connector');

const cliProgress = require('cli-progress');
const moment = require('moment');

const dfd = require("danfojs-node");
const { segmentation } = require('./modules/Analysis');
const { IchimokuCloud, BollingerBands, OBV } = require('technicalindicators');

let collecting = false;
module.exports = {
  get: {
    "initialize": async (req, res, next) => {
      if (!collecting) {
        let stockList = await collector.getStockList();

        stockList = stockList.filter((d) => (!(d.stock_name.includes("KODEX") || d.stock_name.includes("TIGER") || d.stock_name.includes("KOSEF") || d.stock_name.includes("HANARO") || d.stock_name.includes("KINDEX") || d.stock_name.includes("선물") || d.stock_name.includes("인버스") || d.stock_name.includes("KBSTAR") || d.stock_name.includes("ARIRANG") || d.stock_name.includes("ETN") || d.stock_name.includes("고배당"))))

        await connector.dao.StockList.drop();
        await connector.dao.StockList.create();
        await connector.dao.StockList.truncate();
        await connector.dao.StockList.batchInsert(stockList);

        const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress_bar.start(stockList.length, 0);

        const nextStep = async (step) => {
          if (step < stockList.length) {
            var item = stockList[step];
            connector.dao.StockData.table_name = "stock_data_" + item.stock_code;
            await connector.dao.StockData.create();

            progress_bar.update(step + 1);
            nextStep(step + 1);
          } else {
            progress_bar.stop();
          }
        }
        nextStep(0)
      }
      res.status(200).send('OK');
    },
    "clear": async (req, res, next) => {
      if (!collecting) {
        const stockList = await connector.dao.StockList.select({});

        connector.dao.StockData.table_name = "stock_data";
        await connector.dao.StockData.truncate();

        const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress_bar.start(stockList.length, 0);

        const nextStep = async (step) => {
          if (step < stockList.length) {
            var item = stockList[step];
            connector.dao.StockData.table_name = "stock_data_" + item.stock_code;
            await connector.dao.StockData.truncate();

            progress_bar.update(step + 1);
            nextStep(step + 1);
          } else {
            progress_bar.stop();
          }
        }
        nextStep(0);
      }
      res.status(200).send('OK');
    },
    "collect": async (req, res, next) => {
      if (!collecting) {
        collecting = true;
        const code = req.query.code ? { stock_code: req.query.code } : {};
        const days = req.query.days ? parseInt(req.query.days) : 5;
        const stockList = await connector.dao.StockList.select(code);

        const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progress_bar.start(stockList.length, 0);

        const nextStep = async (step) => {
          if (step < stockList.length) {
            var item = stockList[step];
            connector.dao.StockData.table_name = "stock_data_" + item.stock_code;

            let rows = [];
            let recommended_rows = []
            const data = await collector.getSise(item.stock_code, days);
            if (data.length > 0) {
              const origin_data = await connector.dao.StockData.getTable().where('date', '<', data[0].date);
              const all_data = origin_data.concat(data);

              let prev_result;
              for (let i = all_data.length - data.length; i < all_data.length; i++) {
                let row = all_data[i];
                row['code'] = item.stock_code;
                try {
                  var day_power = (row.close - row.open);
                  var down_power = (row.high - Math.min(row.open, row.close));
                  var up_power = (Math.max(row.open, row.close) - row.low);
                  var power = (up_power - down_power + day_power) * (row.volume / item.stock_total);

                  let result = {
                    curr_trend: 0,
                    init_trend: 0,
                    segmentation: [],
                    upward_point: [],
                    downward_point: [],
                  };
                  // let result_vol = {
                  //   curr_trend: 0,
                  //   init_trend: 0,
                  //   segmentation: [],
                  //   upward_point: [],
                  //   downward_point: [],
                  // };
                  // analysis.segmentation([...all_data].splice(0, i + 1), result_vol, 'volume');
                  analysis.segmentation([...all_data].splice(0, i + 1), result, 'close');
                  let insight = analysis.cross_point(result, row, 'close');

                  result.segmentation.sort((a, b) => a.from.date - b.from.date)
                  result.upward_point.sort((a, b) => a.date - b.date)
                  result.downward_point.sort((a, b) => a.date - b.date)

                  let clouds = new IchimokuCloud({
                    high: [...all_data].slice(i - 78, i).map((d) => d.high),
                    low: [...all_data].slice(i - 78, i).map((d) => d.low),
                    conversionPeriod: 9,
                    basePeriod: 26,
                    spanPeriod: 52,
                    displacement: 26
                  }).result;

                  let bands = new BollingerBands({
                    period: 20,
                    stdDev: 2,
                    values: [...all_data].slice(i - 20, i).map((d) => d.close),
                  }).result

                  let band_data = bands
                  let cloud_data = clouds;
                  let meta = {
                    curr_trend: result.curr_trend,
                    init_trend: result.init_trend,
                    segmentation: result.segmentation.length,
                    upward_point: result.upward_point.length,
                    downward_point: result.downward_point.length,
                    insight: insight,
                    power: power
                  };
                  meta['cloud'] = cloud_data[0];
                  meta['band'] = band_data[0];

                  /*
                    spanA > spanB 양운
                    spanA < spanB 음운
                    conversion 전환선
                    base 기준선
                  */

                  // 미래 구름
                  let future_conversion = 0;
                  let future_base = 0;
                  let future_trend = 0;
                  for (var c = 1; c < cloud_data.length; c++) {
                    const future_cloud = cloud_data[c];
                    if (future_cloud) {
                      future_trend += (future_cloud.spanA - future_cloud.spanB)
                      future_conversion += future_cloud.conversion;
                      future_base += future_cloud.base;
                    }
                  }
                  meta['future_trend'] = future_trend / 26;
                  meta['future_conversion'] = future_conversion / 26;
                  meta['future_base'] = future_base / 26;

                  result['meta'] = meta;

                  row['meta'] = JSON.stringify(meta);

                  if (prev_result) {
                    if (prev_result.meta.insight.support + prev_result.meta.insight.future_resist <= prev_result.meta.insight.resist + prev_result.meta.insight.future_support && insight.support + insight.future_resist > insight.future_support + insight.resist && !((meta.cloud.spanA - meta.cloud.spanB) < 0 && meta.cloud.spanB > row.close) && meta.band.lower < row.close) {
                      row['marker'] = '매수';
                      let futures = all_data.slice(i + 1, i + 61);
                      if (futures.length == 60) {
                        var buy = undefined;
                        var sell = undefined;
                        [...futures].forEach((d) => {
                          if (!buy && d.low < meta.band.lower && d.close > meta.band.lower) {
                            buy = d.close
                          }
                          if (buy && d.high > buy * 1.05) {
                            sell = d.high
                          }
                        })
                        // var max_point = [...futures].sort((a, b) => b.high - a.high)[0];
                        // var high_rate = max_point.high / row.close * 100;
                        if (sell && buy) {
                          row['result'] = sell / buy * 100;
                        }

                        if (buy && !sell) {
                          row['result'] = "매도 실패"
                        }

                        if (!buy) {
                          row['result'] = "매수 실패"
                        }
                      }

                      // row['meta'] = JSON.stringify(meta);
                      recommended_rows.push(row)
                    }
                  }
                  prev_result = result;

                } catch (error) {
                  console.log(error)
                }

                rows.push(row);
              }

              if (rows.length > 0) {
                if (rows.length > 100) {
                  await connector.dao.StockData.batchInsert(rows);
                } else {
                  await connector.dao.StockData.insert(rows).onConflict(['code', 'date']).merge();
                }
              }

              if (recommended_rows.length > 0) {
                connector.dao.StockData.table_name = "stock_data";
                if (recommended_rows.length > 100) {
                  await connector.dao.StockData.batchInsert(recommended_rows);
                } else {
                  await connector.dao.StockData.insert(recommended_rows).onConflict(['code', 'date']).merge();
                }
              }
            }

            progress_bar.update(step + 1);
            nextStep(step + 1);
          } else {
            collecting = false;
            progress_bar.stop();
          }
        }
        nextStep(0);
      }
      res.status(200).send('OK');
    },
    "suggest": async (req, res, next) => {
      const query = req.query.date ? { date: new Date(req.query.date).getTime() - 32400000, marker: '매수' } : { date: new Date(moment().format('YYYY-MM-DD')).getTime() - 32400000, marker: '매수' };
      const stockData = new connector.types.StockData(connector.database);
      const origin_data = await stockData.select(query)

      res.status(200).send(origin_data.map((d) => {
        d.meta = JSON.parse(d.meta)
        return d
      }))
    },
    "test": async (req, res, next) => {
      const stockData = new connector.types.StockData(connector.database);
      const origin_data = await stockData.select()

      const data = origin_data.map((d) => {
        d['meta'] = JSON.parse(d.meta)
        return d;
      })

      console.log(data.length, data.filter((d) => d.result > 105).map((d) => d.result).length, origin_data.length)

      res.status(200).send('OK')
    }
  }
}