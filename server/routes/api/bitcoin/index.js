const wait = require('waait')
const axios = require('axios');
const analysis = require('../../modules/Analysis');

const request = require('request')
const { v4: uuidv4 } = require("uuid")
const crypto = require('crypto')
const sign = require('jsonwebtoken').sign
const queryEncode = require("querystring").encode

const access_key = process.env.UPBIT_OPEN_API_ACCESS_KEY
const secret_key = process.env.UPBIT_OPEN_API_SECRET_KEY
const server_url = process.env.UPBIT_OPEN_API_SERVER_URL

const { BollingerBands } = require('technicalindicators');
// 비트코인도 가보즈아~~~!!
module.exports = {
  get: {
    "auto_trading": async (req, res, next) => {
      const payload = {
        access_key: access_key,
        nonce: uuidv4(),
      }

      const token = sign(payload, secret_key)

      request({
        method: "GET",
        url: server_url + "/v1/accounts",
        headers: { Authorization: `Bearer ${token}` },
      }, (error, response, body) => {
        if (error) throw new Error(error)
        console.log(body)
      })

      // const body = {
      //   market: 'KRW-BTC',
      //   side: 'bid', // ask
      //   volume: '0.01',
      //   price: '100',
      //   ord_type: 'limit',
      // }

      // const query = queryEncode(body)

      // const hash = crypto.createHash('sha512')
      // const queryHash = hash.update(query, 'utf-8').digest('hex')

      // const payload = {
      //   access_key: access_key,
      //   nonce: uuidv4(),
      //   query_hash: queryHash,
      //   query_hash_alg: 'SHA512',
      // }

      // const token = sign(payload, secret_key)

      // request({
      //   method: "POST",
      //   url: server_url + "/v1/orders",
      //   headers: { Authorization: `Bearer ${token}` },
      //   json: body
      // }, (error, response, body) => {
      //   if (error) throw new Error(error)
      //   console.log(body)
      // })

    },
    "analysis": async (req, res, next) => {
      const response = await axios.get(`${server_url}/v1/market/all`);
      const list = response.data.filter((d) => d.market.includes('KRW-'))

      const getInsight = async (minutes, market) => {
        const { data } = await axios.get(`${server_url}/v1/candles/minutes/${minutes}?market=${market}&count=200`)
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
        let bands = new BollingerBands({
          period: 20,
          stdDev: 2,
          values: [...rows].slice(rows.length - 20).map((d) => d.close),
        }).result

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
          row: row,
          band: bands[0]
        }
      }
      for (var i = 0; i < list.length; i++) {

        const long = await getInsight(240, list[i].market);
        const short = await getInsight(60, list[i].market);
        const curr = await getInsight(15, list[i].market);

        if ((curr.insight.support + curr.insight.future_resist) > (curr.insight.future_support + curr.insight.resist) && !curr.prev_insight.support_price && curr.insight.support_price) {
          const buy_price = (curr.insight.support_price + curr.band.lower + curr.row.high) / 3;

          if (curr.row.low < buy_price && curr.row.close > buy_price) {
            console.log(list[i].market, buy_price, (curr.insight.support + curr.insight.future_resist) > (curr.insight.future_support + curr.insight.resist));
          }

        }

        await wait(250);
      }
      res.status(200).send(response.data);
    }
  }
}