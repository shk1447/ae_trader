const collector = require('../../modules/NaverFinance');
const analysis = require('../../modules/Analysis');
const connector = require('../../../connector');

const cliProgress = require('cli-progress');
const moment = require('moment');

const dfd = require("danfojs-node");
const { segmentation } = require('../../modules/Analysis');
const { IchimokuCloud, BollingerBands, OBV, SMA } = require('technicalindicators');

let collecting = false;

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
          if(d.meta) {
            d.meta = JSON.parse(d.meta);
          }
          return d;
        })

        const support_rows = all_data.filter((d) => d.meta && d.meta.insight.support_price);
        const resist_rows = all_data.filter((d) => d.meta && d.meta.insight.resist_price);

        let last_support_price = support_rows[support_rows.length - 1] ? support_rows[support_rows.length - 1].meta.insight.support_price : null;
        let last_resist_price = resist_rows[resist_rows.length - 1] ? resist_rows[resist_rows.length - 1].meta.insight.resist_price : null;

        let prev_result;
        for (let i = all_data.length - data.length; i < all_data.length; i++) {
          let row = all_data[i];
          row['code'] = item.stock_code;
          try {
            const curr_power = _.mean([...all_data].slice(i - 20, i).map((d) => {
              var day_power = (d.close - d.open);
              var down_power = (d.high - Math.min(d.open, d.close));
              var up_power = (Math.max(d.open, d.close) - d.low);
              var power = (up_power - down_power + day_power) * (d.volume / item.stock_total);
              return power;
            }))

            let result = {
              curr_trend: 0,
              init_trend: 0,
              segmentation: [],
              upward_point: [],
              downward_point: [],
            };

            analysis.segmentation([...all_data].splice(0, i + 1), result, 'close');
            let insight = analysis.cross_point(result, row, 'close');

            insight['last_support_price'] = last_support_price;
            insight['last_resist_price'] = last_resist_price;

            if(insight.support_price) last_support_price = insight.support_price;
            if(insight.resist_price) last_resist_price = insight.resist_price;

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
              date: moment(row.date).format('YYYY-MM-DD')
            };

            let bands = new BollingerBands({
              period: 20,
              stdDev: 2,
              values: [...all_data].slice(i - 20, i).map((d) => d.close),
            }).result
            if (bands.length > 0) {
              let band_data = bands;
              meta['band'] = band_data[0];
            }
            /*
              spanA > spanB 양운
              spanA < spanB 음운
              conversion 전환선
              base 기준선
            */

            result['meta'] = meta;

            if (prev_result) {
              if (!prev_result.meta.insight.support_price && insight.support_price && insight.support > insight.resist && result.meta.curr_power > prev_result.meta.curr_power && result.meta.curr_power > 0) {
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

      const stockList = new connector.types.StockData(connector.database);
      const origin_data = await stockList.getTable().where('date', '>=', query_date).andWhere('date', '<=', req_date)
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
          let curr_data = data[data.length - 1] ? data[data.length - 1] : item;

          var day_power = (curr_data.close - curr_data.open);
          var down_power = (curr_data.high - Math.min(curr_data.open, curr_data.close));
          var up_power = (Math.max(curr_data.open, curr_data.close) - curr_data.low);
          var power = (up_power - down_power + day_power) * (curr_data.volume / item.stock_total);

          if (data.length > 0 && curr_data.volume > 0) {
            var max_point = [...data].sort((a, b) => b.high - a.high)[0];
            var high_rate = max_point.high / item.close * 100;

            if (high_rate < expected_rate) {
              let _buy_price = _.mean([...data].map((d) => {
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
                return buy_price / count
              }))

              result.push({
                code: item.code,
                power: curr_data.meta.curr_power,
                date: moment(item.date).format('YYYY-MM-DD'),
                buy_price: _buy_price,
                isBuy: _buy_price >= curr_data.low && _buy_price <= curr_data.close
              })
            }
          } else {
            let count = 1;
            let buy_price = item.close;
            if (item.meta.insight.support_price) {
              buy_price += item.meta.insight.support_price;
              count++;
            }
            if (item.meta.cloud && item.meta.cloud.conversion) {
              buy_price += item.meta.cloud.conversion;
              count++;
            }
            let _buy_price = buy_price / count;
            result.push({
              code: item.code,
              power: item.meta.curr_power,
              date: moment(item.date).format('YYYY-MM-DD'),
              buy_price: _buy_price,
              isBuy: _buy_price >= curr_data.low && _buy_price <= curr_data.close
            })
          }
          nextStep(step + 1);
        } else {
          result.sort((prev, curr) => curr.power - prev.power)
          if (auto) {
            res.status(200).send(result)
          } else {
            res.status(200).send(result.filter((d) => d.isBuy))
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

      var day_power = (curr_data.close - curr_data.open);
      var down_power = (curr_data.high - Math.min(curr_data.open, curr_data.close));
      var up_power = (Math.max(curr_data.open, curr_data.close) - curr_data.low);
      var power = (up_power - down_power + day_power) * (d.volume / item.stock_total);

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
      res.status(200).send({
        status: curr_data.meta.insight.support < curr_data.meta.insight.resist ? '매도' : '홀딩',
        sell_price: sell_price / count,
        buy_price: buy_price / buy_count,
      })
    },
    "test": async (req, res, next) => {
      // 테스트 : 기간내 5프로 초과 수익 82프로 성공 확인
      // 테스트 : 기간내 3프로 초과 수익 89프로 성공 확인
      const rate = req.query.rate ? parseFloat(req.query.rate) : 105;
      const stockData = new connector.types.StockData(connector.database);
      let origin_data = await stockData.select()

      origin_data = origin_data.map((d) => {
        d.meta = JSON.parse(d.meta)
        return d
      })
      var good_list = origin_data.filter((d) => d.result > rate)

      console.log(good_list.length, origin_data.filter((d) => d.result).length, _.mean(good_list.map((d) => d.result)))
      res.status(200).send()
    },
  }
}