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
        data.sort((a, b) => a.timestamp - b.timestamp)
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
        const curr = await getInsight(15, list[i].market);

        if ((long.insight.support + long.insight.future_resist) > (long.insight.future_support + long.insight.resist) && !long.prev_insight.support_price && long.insight.support_price) {
          const buy_price = (long.insight.support_price + long.row.high) / 2;

          if (long.row.low < buy_price && long.row.close > buy_price) {
            console.log(list[i].market, buy_price, long.row.low);
          }

        }

        await wait(250);
      }
      res.status(200).send(response.data);
    }
  }
}