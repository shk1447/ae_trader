const collector = require('./modules/NaverFinance');
const analysis = require('./modules/Analysis');
const connector = require('../../../connector');
const SMA = require('technicalindicators').SMA
const BB = require('technicalindicators').BollingerBands;
const CLOUD = require('technicalindicators').IchimokuCloud

const cliProgress = require('cli-progress');

const dfd = require("danfojs-node");
const { segmentation } = require('./modules/Analysis');
const { IchimokuCloud } = require('technicalindicators');

module.exports = {
  get: {
    "initialize": async (req, res, next) => {
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
      res.status(200).send('OK');
    },
    "clear": async (req, res, next) => {
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
      res.status(200).send('OK');
    },
    "collect": async (req, res, next) => {
      const code = req.query.code ? { stock_code: req.query.code } : {};
      const days = req.query.days ? parseInt(req.query.days) : 5;
      const stockList = await connector.dao.StockList.select(code);

      const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress_bar.start(stockList.length, 0);

      const nextStep = async (step) => {
        if (step < stockList.length) {
          var item = stockList[step];
          connector.dao.StockData.table_name = "stock_data_" + item.stock_code;
          let metadata = [];
          let rows = [];
          let recommended_rows = []
          const data = await collector.getSise(item.stock_code, days);
          
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
              analysis.segmentation([...all_data].splice(0, i + 1), result);
              let insight = analysis.cross_point(result, row);
              result['insight'] = insight
              metadata.push(result);
              const period = 5;
              
              result.segmentation.sort((a, b) => a.from.date - b.from.date)

              let clouds = new IchimokuCloud({
                high: [...all_data].splice(0, i + 1).map((d) => d.high),
                low: [...all_data].splice(0, i + 1).map((d) => d.low),
                conversionPeriod: 9,
                basePeriod: 26,
                spanPeriod: 52,
                displacement: 26
              }).result;
    
              let cloud_data = new Array(77).concat(clouds)

              if (metadata.length >= period) {
                const short_mean_arr = metadata.slice(i - (period - 1), i + 1);

                const support_arr = short_mean_arr.map((d) => d.insight.support);
                const resist_arr = short_mean_arr.map((d) => d.insight.resist);
                const future_support_arr = short_mean_arr.map((d) => d.insight.future_support);
                const future_resist_arr = short_mean_arr.map((d) => d.insight.future_resist);
                insight.support = _.mean(support_arr);
                insight.resist = _.mean(resist_arr);
                insight.future_support = _.mean(future_support_arr);
                insight.future_resist = _.mean(future_resist_arr);

                if (prev_result) {
                  let meta = {
                    curr_trend: result.curr_trend,
                    init_trend: result.init_trend,
                    segmentation: result.segmentation.length,
                    upward_point: result.upward_point.length,
                    downward_point: result.downward_point.length,
                    insight: insight,
                    power: power
                  }

                  /*
                    spanA > spanB 양운
                    spanA < spanB 음운
                    conversion 전환선
                    base 기준선
                  */
                  meta['cloud'] = cloud_data[cloud_data.length - 27]

                  // 미래 구름
                  let future_conversion = 0;
                  let future_trend = 0;
                  let train = [];
                  for(var c = 26; c > 0; c--) {
                    const future_cloud = cloud_data[cloud_data.length - c];
                    if(future_cloud) {
                      future_trend += (future_cloud.spanA - future_cloud.spanB)
                      future_conversion += future_cloud.conversion;
                      train.push((future_cloud.spanA - future_cloud.spanB))
                    }
                  }
                  meta['future_trend'] = future_trend / 26;
                  meta['future_conversion'] = future_conversion / 26;
                  meta['train'] = train;

                  row['meta'] = JSON.stringify(meta);

                  if (insight.support > insight.resist && prev_result.insight.support < prev_result.insight.resist && prev_result.insight.resist > insight.resist && prev_result.insight.support < insight.support && insight.resist + insight.future_support < insight.future_resist + insight.support && prev_result.insight.resist + prev_result.insight.future_support > prev_result.insight.future_resist + prev_result.insight.support) {
                    row['marker'] = '매수';
                    let futures = all_data.slice(i + 1, i + 61);
                    if (futures.length == 60) {
                      var max_point = [...futures].sort((a, b) => b.high - a.high)[0];
                      var high_rate = max_point.high / row.close * 100;
                      row['result'] = high_rate;
                    }

                    row['meta'] = JSON.stringify(meta);
                    recommended_rows.push(row)
                  }
                }
                prev_result = result;
              }
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

          progress_bar.update(step + 1);
          nextStep(step + 1);
        } else {
          progress_bar.stop();
        }
      }
      nextStep(0);
      res.status(200).send('OK');
    },
    "test": async(req,res,next) => {
      connector.dao.StockData.table_name = "stock_data";
      const origin_data = await connector.dao.StockData.select();

      const data = origin_data.map((d) => {
        d['meta'] = JSON.parse(d.meta)
        return d;
      }).filter((d) => {
        return d.meta.future_trend > 0
      })

      console.log(data.length, data.filter((d) => d.result > 105).map((d) => d.result).length, origin_data.length)

      res.status(200).send('OK')
    }
  }
}