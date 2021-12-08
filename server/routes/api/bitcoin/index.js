const moment = require('moment')
const wait = require('waait')
const axios = require('axios');
const analysis = require('../../modules/Analysis');

const request = require('request')
const { v4: uuidv4 } = require("uuid")
const crypto = require('crypto')
const sign = require('jsonwebtoken').sign
const queryEncode = require("querystring").encode
const WebSocket = require('ws');

const ws_url = 'wss://api.upbit.com/websocket/v1';
const access_key = process.env.UPBIT_OPEN_API_ACCESS_KEY
const secret_key = process.env.UPBIT_OPEN_API_SECRET_KEY
const server_url = process.env.UPBIT_OPEN_API_SERVER_URL

const { BollingerBands } = require('technicalindicators');


var buyItems = {};

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

      const getInsight = async (data) => {
        const rows = data;
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

        return {
          insight: insight,
          row: row,
          band: bands[0]
        }
      }

      const analysis_job_func = async (unit, val) => {
        for (var i = 0; i < list.length; i++) {
          const day_url = `${server_url}/v1/candles/days?market=${list[i].market}&count=200`
          const min_url = `${server_url}/v1/candles/minutes/${val}?market=${list[i].market}&count=200`
          let { data } = await axios.get(unit === 'day' ? day_url : min_url);
          data.sort((a, b) => a.timestamp - b.timestamp)
          data = data.map((d) => {
            return {
              close: d.trade_price,
              high: d.high_price,
              open: d.opening_price,
              low: d.low_price,
              date: d.timestamp,
              volume: d.candle_acc_trade_volume
            }
          })
          const curr = await getInsight(data);
          if (!buyItems[list[i].market]) {
            buyItems[list[i].market] = {};
          }
          buyItems[list[i].market]['rows_' + unit + '_' + val] = data
          buyItems[list[i].market]['insight_' + unit + '_' + val] = curr
          buyItems[list[i].market]['detect'] = true

          await wait(250);
        }
      }

      var CronJob = require('cron').CronJob;

      await analysis_job_func('day', 1);
      await analysis_job_func('min', 240);
      console.log('started!!!')

      const ws = new WebSocket(ws_url)
      ws.on('open', () => {
        console.log('connected!?')
        ws.send(JSON.stringify([{ "ticket": uuidv4() }, {
          type: 'ticker',
          codes: list.map((d) => d.market)
        }]))
        setInterval(() => {
          ws.send(JSON.stringify({ "status": "UP" }))
        }, 10000)
      })

      ws.on('message', async (msg) => {
        var body = JSON.parse(msg);

        if (buyItems[body.code]['signal']) {
          if (buyItems[body.code]['signal'] > body.trade_price) {
            buyItems[body.code]['buy_price'] = body.trade_price;
          }
        }

        if (buyItems[body.code]['buy_price']) {
          const rate = buyItems[body.code]['buy_price'] / body.trade_price * 100;

          if (rate > 103) {
            vases.logger.info(body.code, '매도')
          }
        }

        if (buyItems[body.code]) {
          var prev_short = buyItems[body.code]['insight_min_240'];
          var short_rows = buyItems[body.code]['rows_min_240'];
          short_rows[short_rows.length - 1] = {
            close: body.trade_price,
            high: short_rows[short_rows.length - 1].high < body.trade_price ? body.trade_price : short_rows[short_rows.length - 1].high,
            open: short_rows[short_rows.length - 1],
            low: short_rows[short_rows.length - 1].low > body.trade_price ? body.trade_price : short_rows[short_rows.length - 1].low,
            date: short_rows[short_rows.length - 1].date,
            volume: short_rows[short_rows.length - 1].volume
          }

          var prev_long = buyItems[body.code]['insight_day_1'];
          var long_rows = buyItems[body.code]['rows_day_1'];
          long_rows[long_rows.length - 1] = {
            close: body.trade_price,
            high: long_rows[long_rows.length - 1].high < body.trade_price ? body.trade_price : long_rows[long_rows.length - 1].high,
            open: long_rows[long_rows.length - 1],
            low: long_rows[long_rows.length - 1].low > body.trade_price ? body.trade_price : long_rows[long_rows.length - 1].low,
            date: long_rows[long_rows.length - 1].date,
            volume: long_rows[long_rows.length - 1].volume
          }

          const curr_short = await getInsight(short_rows);
          const curr_long = await getInsight(long_rows);

          if (!prev_short.insight.support_price && curr_short.insight.support_price && curr_long.insight.support + curr_long.insight.future_resist >= curr_long.insight.resist + curr_long.insight.future_support) {
            vases.logger.info(body.code + " " + moment().format('YYYY-MM-DD HH:mm:ss') + " " + (curr_short.insight.support_price + curr_long.band.middle) / 2);
            buyItems[body.code]['signal'] = (curr_short.insight.support_price + curr_long.band.middle) / 2;
          }

          buyItems[body.code]['rows_min_240'] = short_rows;
          buyItems[body.code]['rows_day_1'] = long_rows;
          buyItems[body.code]['insight_min_240'] = curr_short;
          buyItems[body.code]['insight_day_1'] = curr_long;
        }
      })

      var long_analysis_job = new CronJob('0 9 * * *', () => {
        analysis_job_func('day', 1);
      }, null, false, 'Asia/Seoul');

      // '0 1,5,9,13,17,21 * * *'
      var short_analysis_job = new CronJob('0 1,5,9,13,17,21 * * *', () => {
        analysis_job_func('min', 240);
      }, null, false, 'Asia/Seoul');

      long_analysis_job.start();
      short_analysis_job.start();

      res.status(200).send('START');

      // while (true) {
      //   await trade_job_func(60);
      // }
    }
  }
}