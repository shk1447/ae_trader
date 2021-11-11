const collector = require('./modules/NaverFinance');
const analysis = require('./modules/Analysis');
const connector = require('../../../connector');
const SMA = require('technicalindicators').SMA

const cliProgress = require('cli-progress');

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
        if(step < stockList.length) {
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
    "clear": async (req,res,next) => {
      const stockList = await connector.dao.StockList.select({});

      connector.dao.StockData.table_name = "stock_data";
      await connector.dao.StockData.truncate();

      const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress_bar.start(stockList.length, 0);

      const nextStep = async (step) => {
        if(step < stockList.length) {
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
    "analysis": async (req,res,next) => {
      const days = req.query.days ? req.query.days : 5;
      const stockList = await connector.dao.StockList.select({});

      const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      progress_bar.start(stockList.length, 0);

      const nextStep = async (step) => {
        if(step < stockList.length) {
          var item = stockList[step];
          connector.dao.StockData.table_name = "stock_data_" + item.stock_code;

          let rows = [];
          let recommended_rows = []
          const data = await collector.getSise(item.stock_code, days);
          const close_arr = data.map((d) => d.close)
          let short = new SMA({period:20, values:close_arr});
          let long = new SMA({period:60, values:close_arr});

          let short_ma =new Array(19).concat(short.result)
          let long_ma = new Array(59).concat(long.result)
          let prev_insight;
          for(let i = 0; i < data.length; i++) {
            let row = data[i];
            row['code'] = item.stock_code;
            try {
              if(long_ma[i - 2]) {
                let result = {
                  curr_trend: 0,
                  init_trend: 0,
                  segmentation: [],
                  upward_point: [],
                  downward_point: [],
                };
                analysis.segmentation([...data].splice(0, i + 1), result);
                let insight = analysis.cross_point(result, row);
                
                if(prev_insight) {
                  let meta = {
                    curr_trend: result.curr_trend,
                    init_trend: result.init_trend,
                    segmentation: result.segmentation.length,
                    upward_point: result.upward_point.length,
                    downward_point: result.downward_point.length,
                    insight:insight,
                    prev_insight: prev_insight,
                    short_ma:short_ma.slice(i - 60, i)
                  }
                  row['meta'] = JSON.stringify(meta);
                  if(prev_insight.support.length + prev_insight.future_resist.length <= prev_insight.resist.length + prev_insight.future_support.length && insight.support.length + insight.future_resist.length >= insight.future_support.length + insight.resist.length && insight.support.length > insight.resist.length && prev_insight.support.length < prev_insight.resist.length && prev_insight.future_support.length < insight.future_support.length && prev_insight.resist.length > insight.resist.length) {
                    if(!(long_ma[i - 2] > long_ma[i - 1] && long_ma[i - 1] > long_ma[i])) {
                      row['marker'] = '매수';
                      let futures = data.slice(i, i + 60);
                      if(futures.length == 60) {
                        var max_point = [...futures].sort((a, b) => b.high - a.high)[0];
                        var high_rate = max_point.high / row.close * 100;
                        row['result'] = high_rate;
                      }
                      recommended_rows.push(row)
                    }
                  }
                }
                prev_insight = insight;
              }
            } catch (error) {
              console.log(error)
            }

            rows.push(row);
          }
          
          if(rows.length > 0) {
            await connector.dao.StockData.insert(rows).onConflict(['code', 'date']).merge();
          }         

          if(recommended_rows.length > 0) {
            connector.dao.StockData.table_name = "stock_data";
            await connector.dao.StockData.insert(recommended_rows).onConflict(['code', 'date']).merge();
          }

          progress_bar.update(step + 1);
          nextStep(step + 1);
        } else {
          progress_bar.stop();
        }
      }
      nextStep(0);
      res.status(200).send('OK');
    }
  }
}