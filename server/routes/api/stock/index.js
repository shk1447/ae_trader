const collector = require('../../modules/NaverFinance');
const analysis = require('../../modules/Analysis');
const connector = require('../../../connector');

const cliProgress = require('cli-progress');
const moment = require('moment');

const { segmentation } = require('../../modules/Analysis');
const { IchimokuCloud, BollingerBands, OBV, SMA } = require('technicalindicators');

let collecting = false;

const convertToHoga = (price) => {
  let hoga_price = Math.round(price);
  if (price < 1000) {
    hoga_price = hoga_price;
  } else if (price < 5000) {
    hoga_price = hoga_price - (hoga_price % 5)
  } else if (price < 10000) {
    hoga_price = hoga_price - (hoga_price % 10)
  } else if (price < 50000) {
    hoga_price = hoga_price - (hoga_price % 50)
  } else if (price < 100000) {
    hoga_price = hoga_price - (hoga_price % 100)
  } else if (price < 500000) {
    hoga_price = hoga_price - (hoga_price % 100)
  } else {
    hoga_price = hoga_price - (hoga_price % 100)
  }
  return hoga_price
}

const collectFunc = async (code, days) => {
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
        const all_data = origin_data.concat(data).map((d) => {
          if (d.meta) {
            d.meta = JSON.parse(d.meta);
          }
          return d;
        })

        let prev_result;
        for (let i = all_data.length - data.length; i < all_data.length; i++) {
          let row = all_data[i];
          row['code'] = item.stock_code;
          try {
            const getChangeRate = (arr) => {
              var ret_arr = [];
              if (arr.length > 0) {
                arr.reduce((prev, curr) => {
                  ret_arr.push(curr - prev)
                  return curr
                })
              }
              if (ret_arr.length > 1) {
                ret_arr = getChangeRate(ret_arr)
              }
              return ret_arr
            }

            var period_arr = [...all_data].slice(i - 20, i).map((d) => {
              var day_power = (d.close - d.open);
              var down_power = (d.high - Math.min(d.open, d.close));
              var up_power = (Math.max(d.open, d.close) - d.low);
              var power = (up_power - down_power + day_power) * (d.volume / item.stock_total);
              return power;
            })
            const long_power = _.mean(period_arr);
            const long_change_rate = getChangeRate(period_arr);
            const curr_power = _.mean([...all_data].slice(i - 3, i).map((d) => {
              var day_power = (d.close - d.open);
              var down_power = (d.high - Math.min(d.open, d.close));
              var up_power = (Math.max(d.open, d.close) - d.low);
              var power = (up_power - down_power + day_power) * (d.volume / item.stock_total);
              return power;
            }));

            let result = {
              curr_trend: 0,
              init_trend: 0,
              segmentation: [],
              upward_point: [],
              downward_point: [],
            };

            analysis.segmentation([...all_data].splice(0, i + 1), result, 'close');
            let insight = analysis.cross_point(result, row, 'close');

            result.segmentation.sort((a, b) => a.from.date - b.from.date)
            result.upward_point.sort((a, b) => a.date - b.date)
            result.downward_point.sort((a, b) => a.date - b.date)

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
              date: moment(row.date).format('YYYY-MM-DD')
            };

            let clouds = new IchimokuCloud({
              high: [...all_data].slice(i - 77, i).map((d) => d.high),
              low: [...all_data].slice(i - 77, i).map((d) => d.low),
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
            if (bands.length > 0) {
              let band_data = bands;
              meta['band'] = band_data[0];
            }

            if (clouds.length > 0) {
              meta['cloud'] = {
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

            result['meta'] = meta;

            if (prev_result) {
              if (!prev_result.meta.insight.support_price && insight.support_price && insight.support > insight.resist
                && long_power < curr_power && long_change_rate >= 0 && prev_result.meta.long_change_rate < 0) {
                row['marker'] = '매수';
                let futures = all_data.slice(i + 1, i + 61);
                if (futures.length == 60) {
                  var max_point = [...futures].sort((a, b) => b.high - a.high)[0];
                  var high_rate = max_point.high / row.close * 100;

                  row['result'] = high_rate

                }
                recommended_rows.push(row)
              }
            }

            row['meta'] = JSON.stringify(meta);
            prev_result = result;

          } catch (error) {
            console.log(error)
          }

          rows.push(row);
        }

        if (rows.length > 0) {
          if (rows.length > 50) {
            await connector.dao.StockData.batchInsert(rows);
          } else {
            await connector.dao.StockData.insert(rows).onConflict(['code', 'date']).merge();
          }
        }

        if (recommended_rows.length > 0) {
          connector.dao.StockData.table_name = "stock_data";
          if (recommended_rows.length > 50) {
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
module.exports = {
  get: {
    "initialize": async (req, res, next) => {
      if (!collecting) {
        let stockList = await collector.getStockList();

        stockList = stockList.filter((d) => (d.stock_roe != 'N/A'&& d.stock_per != 'N/A'))

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
      res.status(200).send('OK');
    },
    "collect": async (req, res, next) => {
      if (!collecting) {
        collecting = true;
        const collect_job_func = async () => {
          const code = req.query.code ? { stock_code: req.query.code } : {};
          const days = req.query.days ? parseInt(req.query.days) : 5;

          collectFunc(code, days);
        }

        if (req.query.cron) {
          var CronJob = require('cron').CronJob;
          var collect_job = new CronJob('5 9-16 * * 1-5', collect_job_func, null, false, 'Asia/Seoul');
          collect_job.start();
        } else {
          collect_job_func();
        }
      }
      res.status(200).send('OK');
    },
    "suggest": async (req, res, next) => {
      const expected_rate = req.query.rate ? parseFloat(req.query.rate) : 105;
      const auto = req.query.auto !== undefined ? JSON.parse(req.query.auto) : true;
      const req_date = req.query.date ? new Date(req.query.date).getTime() - 32400000 : new Date(moment().format('YYYY-MM-DD')).getTime() - 32400000;
      const query_date = moment(req_date).add(-60, 'day').unix() * 1000

      const _stockList = new connector.types.StockList(connector.database);
      const stockList = new connector.types.StockData(connector.database);
      const origin_data = await stockList.getTable().where('date', '>=', query_date).andWhere('date', '<=', req_date)
      let origin_map = {};
      const origin_list = await _stockList.select();
      origin_list.forEach((item) => {
        origin_map[item.stock_code] = item;
      });
      const result = [];

      const nextStep = async (step) => {
        if (step < origin_data.length) {
          var item = origin_data[step];
          item['meta'] = JSON.parse(item.meta)
          const stockData = new connector.types.StockData(connector.database);
          stockData.table_name = "stock_data_" + item.code;

          let data = await stockData.getTable().where('date', '>', item.date).andWhere('date', '<=', req_date)
          data = data.map((d) => {
            d['meta'] = JSON.parse(d.meta);
            return d
          });
          let curr_data = data[data.length - 1];

          if (data.length > 0) {
            var max_point = [...data].sort((a, b) => b.high - a.high)[0];
            var high_rate = max_point.high / item.close * 100;

            const getChangeRate = (arr) => {
              var ret_arr = [];
              if (arr.length > 0) {
                arr.reduce((prev, curr) => {
                  ret_arr.push(curr - prev)
                  return curr
                })
              }
              if (ret_arr.length > 1) {
                ret_arr = getChangeRate(ret_arr)
              }
              return ret_arr
            }

            if (high_rate < expected_rate) {
              var support_arr = [...data].map((d) => {
                let count = 1;
                let buy_price = d.close;
                if (d.meta.insight && d.meta.insight.support_price) {
                  buy_price += d.meta.insight.support_price;
                  count++
                }

                if (d.meta.band && d.meta.band.lower) {
                  buy_price += d.meta.band.lower;
                  count++;
                }

                let support_price = buy_price / count;

                return support_price
              })
              const change_rate = getChangeRate(support_arr);
              let _buy_price = _.mean(support_arr)
              
              result.push({
                code: item.code,
                name: origin_map[item.code].stock_name,
                close: curr_data.close,
                power: curr_data.meta.curr_power,
                date: moment(item.date).format('YYYY-MM-DD'),
                change_rate: change_rate,
                buy_price: convertToHoga(_buy_price),
                isBuy: _buy_price >= curr_data.low && _buy_price <= curr_data.close
              })
            }
          } else {
            var _buy_price = item.meta.support_price + item.close;
            if (item.meta.cloud) {
              _buy_price = (item.meta.cloud.conversion + item.meta.cloud.base) / 2;
            }
            result.push({
              code: item.code,
              name: origin_map[item.code].stock_name,
              close: item.close,
              power: item.meta.curr_power,
              date: moment(item.date).format('YYYY-MM-DD'),
              buy_price: convertToHoga(_buy_price),
              change_rate:item.meta.long_change_rate,
              isBuy: _buy_price >= item.low && _buy_price <= item.close
            })
          }
          nextStep(step + 1);
        } else {
          result.sort((prev, curr) => curr.power - prev.power)
          if (auto) {
            res.status(200).send(result.filter((d) => d.change_rate[0] > 0))
          } else {
            res.status(200).send(result.filter((d) => d.change_rate[0] > 0 && d.isBuy))
          }
        }
      }
      await nextStep(0);
    },
    "status": async (req, res, next) => {
      // 최종 매도에 대한 결정 및 가격 제공 ( 테스트 필요함. )
      const code = req.query.code;
      const req_date = req.query.date ? new Date(req.query.date).getTime() - 32400000 : new Date(moment().format('YYYY-MM-DD')).getTime() - 32400000;

      await collectFunc({ stock_code: code }, 1);

      const stockData = new connector.types.StockData(connector.database);
      stockData.table_name = "stock_data_" + code;

      let data = await stockData.getTable().where('date', '<=', req_date);

      let curr_data = data[data.length - 1];
      curr_data['meta'] = JSON.parse(curr_data['meta']);

      let count = 1;
      let buy_count = 1;
      let sell_price = curr_data.low;
      let buy_price = curr_data.close;

      if (curr_data.meta.band) {
        sell_price += curr_data.meta.band.upper;
        buy_price += curr_data.meta.band.lower;
        buy_count++
        count++
      }

      if (curr_data.meta.insight && curr_data.meta.insight.resist_price) {
        sell_price += curr_data.meta.insight.resist_price;
        count++
      }

      if (curr_data.meta.insight && curr_data.meta.insight.support_price) {
        buy_price += curr_data.meta.insight.support_price;
        buy_count++
      }

      /*
        status : 만약 샀다면, 매도거나 홀딩상태 제공!
        sell_price : 매도 가능한 저항가격 제공!
        buy : 현재 사야되나 말아야되나 정보 제공 boolean
      */

      process.send({
        action:'LightWS.send',
        args:["stock", {publish:[{code:curr_data.code, close:curr_data.close}]}, {subscribe:"000020"}]
      })
      
      res.status(200).send({
        status: curr_data.meta.insight.resist_price ? '매도' : '홀딩',
        code: curr_data.code,
        close:curr_data.close,
        sell_price: convertToHoga(sell_price / count),
        buy_price: convertToHoga(buy_price / buy_count),
        buy: curr_data.meta.insight.support >= curr_data.meta.insight.resist
      })
    },
    "test": async (req, res, next) => {
      // 테스트 : 기간내 5프로 이상 수익 79프로 성공 확인
      const rate = req.query.rate ? parseFloat(req.query.rate) : 105
      const stockData = new connector.types.StockData(connector.database);
      const origin_data = await stockData.select()

      var good_list = origin_data.filter((d) => d.result > rate)

      console.log(good_list.length, origin_data.filter((d) => d.result).length, _.mean(good_list.map((d) => d.result)))
      res.status(200).send()
    },
  },
  post: {
    "favorite": async(req,res,next) => {
      const codes = req.body.codes;
      // 관심종목 등록 api
      res.status(200).send();
    }
  }
}