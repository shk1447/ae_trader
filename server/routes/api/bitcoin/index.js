const wait = require('waait')
const axios = require('axios');
const analysis = require('../../modules/Analysis');
// const { BollingerBands } = require('technicalindicators');
// 비트코인도 가보즈아~~~!!
module.exports = {
  get: {
    "analysis": async (req, res, next) => {
      const response = await axios.get('https://api.upbit.com/v1/market/all');
      const list = response.data.filter((d) => d.market.includes('KRW-'))

      const getInsight = async (minutes, market) => {
        const { data } = await axios.get(`https://api.upbit.com/v1/candles/minutes/${minutes}?market=${market}&count=200`)
        const rows = data.map((d) => {
          return {
            close: d.trade_price,
            high: d.high_price,
            open: d.opening_price,
            low: d.low_price,
            date: d.timestamp,
            volume: d.candle_acc_trade_volume
          }
        })

        const row = rows[rows.length - 1];
        let result = {
          curr_trend: 0,
          init_trend: 0,
          segmentation: [],
          upward_point: [],
          downward_point: [],
        };

        analysis.segmentation(rows, result, 'close');
        let insight = analysis.cross_point(result, row, 'close');
        analysis.segmentation(rows.slice(0, rows.length - 1), result, 'close');
        let prev_insight = analysis.cross_point(result, rows.slice(0, rows.length - 1), 'close');

        return {
          insight: insight,
          prev_insight: prev_insight,
          row: row
        }
      }
      for (var i = 0; i < list.length; i++) {

        const long = await getInsight(240, list[i].market);
        const short = await getInsight(60, list[i].market);
        const curr = await getInsight(10, list[i].market);

        if ((curr.insight.support + curr.insight.future_resist) > (curr.insight.future_support + curr.insight.resist) && !curr.prev_insight.support_price && curr.insight.support_price) {
          console.log(list[i].market, (curr.insight.support_price + curr.row.close) / 2)
        }

        await wait(200);
      }
      res.status(200).send(response.data);
    }
  }
}