global._ = require('lodash');
const fs = require('fs');
const path = require('path');
const fsPath = require('fs-path');
const moment = require('moment');
const SMA = require('technicalindicators').SMA
const cliProgress = require('cli-progress');
const progress_bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
const SLOW = require('technicalindicators').stochastic;


const Database = require('./common/Database');
const collector = require('./common/NaverFinance.js');
stock = {
  db: null
}

var CronJob = require('cron').CronJob;

Database({
  "type": "sqlite3",
  "sqlite3": {
    "filename": "./stock.db"
  }
}).then(function (db) {
  stock.db = db;
  var collect_job = new CronJob('5 14-16 * * 1-5', collect_job_func, null, false, 'Asia/Seoul');
  // var offer_job = new CronJob('25 9,11,14,15 * * 1-5', offer_job_func, null, false, 'Asia/Seoul');
  // collect_job.start();
  // offer_job.start();



  offer_job_func().then((d) => {

  });
  // collect_job_func();
}).catch(function (err) {
  console.log(err)
})

function collect_job_func() {
  stock_list_func().then(() => {
    stock_data_func().then(() => {
      offer_job_func().then(() => {
        // collect_job_func();
      })
    })
  })
}

function offer_job_func() {
  return new Promise((resolve, reject) => {
    function next(d) {
      console.log(d)
      recommend_func(d).then((date) => {
        if (d > 0) {
          next(d - 1)
        }
        // pricing_func(date).then(() => {

        // }).finally(() => {
        //   if (d > 60) {
        //     next(d - 1)
        //   }
        // })
        resolve()
      }).catch((err) => {
        reject()
      })
    }
    next(100)
  })

}

function stock_list_func() {
  var data = new stock.db.dao.Stock();
  var obj = new stock.db.dao.StockList();
  return new Promise((resolve, reject) => {
    collector.getStockList().then((stock_list) => {
      obj.drop().then(() => {
        obj.create().then(() => {
          obj.truncate().then(() => {
            obj.batchInsert(stock_list).then((res) => {
              function next(i) {
                if (stock_list.length == i) {
                  resolve();
                  return;
                }
                var item = stock_list[i]
                data.table_name = "stock_" + item.stock_code;
                data.create().then(() => {

                }).finally(() => {
                  next(i + 1);
                })
              }
              next(0);
            })
          })
        })
      })
    })
  })
}

function stock_data_func() {
  var list = new stock.db.dao.StockList();
  var obj = new stock.db.dao.Stock();
  return new Promise((resolve, reject) => {
    list.select({}).then((stock_list) => {
      function next(i) {
        if (stock_list.length == i) {
          resolve();
          return;
        }
        var item = stock_list[i];
        obj.table_name = 'stock_' + item.stock_code;
        collector.getSise(item.stock_code, 5).then((data) => {
          var rows = data.map((row) => {
            row['code'] = item.stock_code;
            row['name'] = item.stock_name;
            row['total'] = item.stock_total;
            return row;
          })
          obj.insert(rows).onConflict(['code', 'date']).merge().then((res) => {
            // console.log(res)
          }).catch((err) => {
            console.log(err);
          }).finally(() => {
            console.log('completed : ', item.stock_code)
            next(i + 1);
          })
        })
      }
      next(0)
    })
  })
}

function recommend_func(past_days) {
  var data = new stock.db.dao.Stock();
  var list = new stock.db.dao.StockList();

  return new Promise((resolve) => {
    var days = past_days ? past_days : 0;
    list.select().then((items) => {
      console.log()
      items = items.filter((item) => !(item.stock_name.includes("KODEX") || item.stock_name.includes("TIGER") || item.stock_name.includes("KOSEF") || item.stock_name.includes("HANARO") || item.stock_name.includes("KINDEX") || item.stock_name.includes("선물") || item.stock_name.includes("인버스") || item.stock_name.includes("KBSTAR") || item.stock_name.includes("ARIRANG") || item.stock_name.includes("ETN") || item.stock_name.includes("고배당")))
      progress_bar.start(items.length, 0);
      var origin_data = [];

      function next(i) {

        if (items.length == i) {

          if (origin_data.length > 0) {
            var date = moment(origin_data[0].date).format('YYYY-MM-DD');
            var date_list_path = path.resolve(__dirname, './store/_dates.json');
            var origin_path = path.resolve(__dirname, './store/_list_' + date + '.json');

            origin_data = origin_data.sort((a, b) => b.power - a.power)
            // origin_data = origin_data.slice(0, 7);
            fsPath.writeFileSync(origin_path, JSON.stringify(origin_data, null, 2))

            var dates_exists = fs.existsSync(date_list_path);
            var dates = [];
            if (dates_exists) {
              var old_dates = JSON.parse(fs.readFileSync(date_list_path));
              dates = old_dates;
            }
            if (!dates.includes(date)) {
              dates.push(date)
            }

            fsPath.writeFileSync(date_list_path, JSON.stringify(dates, null, 2))
          } else {
            if (days == 0) {
              var date = moment().format('YYYY-MM-DD');
              var origin_path = path.resolve(__dirname, './store/_list_' + date + '.json');
              fsPath.writeFileSync(origin_path, JSON.stringify([], null, 2))
            }
          }

          resolve();

          progress_bar.stop();

          return;
        }

        // update the current value in your application..
        progress_bar.update(i + 1);
        var item = items[i]
        data.table_name = 'stock_' + item.stock_code



        data.select().orderBy('date', 'asc').then((real_rows) => {
          function get_signal(rows) {
            var prev_pick = rows[rows.length - 2];
            var pick = rows[rows.length - 1];
            var prev_result = {
              name: item.stock_name,
              total: item.stock_total,
              close: prev_pick.close,
              date: moment(prev_pick.date).format('YYYY-MM-DD'),
              curr_trend: 0,
              init_trend: 0,
              segmentation: [],
              upward_point: [],
              downward_point: [],
            };
            var result = {
              name: item.stock_name,
              total: item.stock_total,
              close: pick.close,
              date: moment(pick.date).format('YYYY-MM-DD'),
              curr_trend: 0,
              init_trend: 0,
              segmentation: [],
              upward_point: [],
              downward_point: [],
            };

            segmentation([...rows].slice(0, rows.length - 1), prev_result);
            segmentation([...rows], result);
            var cross = [];
            var prev_cross = [];
            prev_result.upward_point.sort((a, b) => a.date - b.date)
            prev_result.downward_point.sort((a, b) => a.date - b.date)
            prev_result.segmentation.sort((a, b) => a.from.date - b.from.date)

            prev_result.upward_point.forEach((up, up_idx) => {
              prev_result.downward_point.forEach((down, down_idx) => {
                var test = getLineIntersect(up, up.diff / 86400000, down, down.diff / 86400000);
                if (test.close > 0) {
                  test['rate'] = test.close / prev_pick.close * 100;
                  test['date'] = moment(test['date']).format('YYYY-MM-DD')
                  prev_cross.push(test);
                }
              })
            });

            var prev_resist = prev_cross.filter((d) => {
              return d.close >= prev_pick.close && moment(prev_pick.date) > moment(d.date)
            })

            var prev_support = prev_cross.filter((d) => {
              return d.close <= prev_pick.close && moment(prev_pick.date) > moment(d.date)
            })

            var prev_future_resist = prev_cross.filter((d) => {
              return d.close >= prev_pick.close && moment(prev_pick.date) <= moment(d.date)
            })

            var prev_future_support = prev_cross.filter((d) => {
              return d.close <= prev_pick.close && moment(prev_pick.date) <= moment(d.date)
            })


            result.upward_point.sort((a, b) => a.date - b.date)
            result.downward_point.sort((a, b) => a.date - b.date)
            result.segmentation.sort((a, b) => a.from.date - b.from.date)

            result.upward_point.forEach((up, up_idx) => {
              result.downward_point.forEach((down, down_idx) => {
                var test = getLineIntersect(up, up.diff / 86400000, down, down.diff / 86400000);
                if (test.close > 0) {
                  test['rate'] = test.close / pick.close * 100;
                  test['date'] = moment(test['date']).format('YYYY-MM-DD')
                  cross.push(test);
                }
              })
            });

            var resist = cross.filter((d) => {
              return d.close >= pick.close && moment(pick.date) > moment(d.date)
            })

            var support = cross.filter((d) => {
              return d.close <= pick.close && moment(pick.date) > moment(d.date)
            })

            var future_resist = cross.filter((d) => {
              return d.close >= pick.close && moment(pick.date) <= moment(d.date)
            })

            var future_support = cross.filter((d) => {
              return d.close <= pick.close && moment(pick.date) <= moment(d.date)
            })

            real_rows[i - 1]['init_trend'] = result.init_trend;
            real_rows[i - 1]['curr_trend'] = result.curr_trend;

            real_rows[i - 1]['cross_support'] = support.length;
            real_rows[i - 1]['cross_resist'] = resist.length;
            real_rows[i - 1]['future_support'] = future_support.length;
            real_rows[i - 1]['future_resist'] = future_resist.length;

            real_rows[i - 1]['prev_cross_support'] = prev_support.length;
            real_rows[i - 1]['prev_cross_resist'] = prev_resist.length;
            real_rows[i - 1]['prev_future_support'] = prev_future_support.length;
            real_rows[i - 1]['prev_future_resist'] = prev_future_resist.length;

            real_rows[i - 1]['upward_point'] = result.upward_point.length;
            real_rows[i - 1]['downward_point'] = result.downward_point.length;
            real_rows[i - 1]['last_upward'] = result.upward_point.length > 0 ? result.upward_point[result.upward_point.length - 1] : null;
            real_rows[i - 1]['last_downward'] = result.downward_point.length > 0 ? result.downward_point[result.downward_point.length - 1] : null;
            real_rows[i - 1]['prev_upward'] = result.upward_point.length > 1 ? result.upward_point[result.upward_point.length - 2] : null;
            real_rows[i - 1]['prev_downward'] = result.downward_point.length > 1 ? result.downward_point[result.downward_point.length - 2] : null;

            real_rows[i - 1]['date_format'] = moment(real_rows[i - 1]['date']).format('YYYY-MM-DD')

            var up_avg_volume = 0;
            var up_avg_degree = 0;
            var up_avg_diff = 0;
            result.upward_point.forEach((d) => {
              up_avg_degree += d.degree;
              up_avg_volume += d.avg_volume;
              up_avg_diff += d.diff;
            })
            if (result.upward_point.length > 0) {
              up_avg_degree = up_avg_degree / result.upward_point.length
              up_avg_volume = up_avg_volume / result.upward_point.length
              up_avg_diff = up_avg_diff / result.upward_point.length
            }

            var down_avg_volume = 0;
            var down_avg_degree = 0;
            var down_avg_diff = 0;
            result.downward_point.forEach((d) => {
              down_avg_degree += d.degree;
              down_avg_volume += d.avg_volume;
              down_avg_diff += d.diff;
            })

            if (result.downward_point.length > 0) {
              down_avg_degree = down_avg_degree / result.downward_point.length
              down_avg_volume = down_avg_volume / result.downward_point.length
              down_avg_diff = down_avg_diff / result.downward_point.length
            }

            var _prev = real_rows[i - 2];
            var _curr = real_rows[i - 1];
            real_rows[i - 1]['marker'] = '대기';
            real_rows[i - 1]['down_avg_diff'] = down_avg_diff
            real_rows[i - 1]['down_avg_volume'] = down_avg_volume
            real_rows[i - 1]['down_avg_degree'] = down_avg_degree
            real_rows[i - 1]['up_avg_diff'] = up_avg_diff
            real_rows[i - 1]['up_avg_volume'] = up_avg_volume
            real_rows[i - 1]['up_avg_degree'] = up_avg_degree

            var prev_day_power = (_prev.close - _prev.open) / (_prev.high - _prev.low);
            var prev_down_power = (_prev.high - Math.min(_prev.open, _prev.close)) / (_prev.high - _prev.low);
            var prev_up_power = (Math.max(_prev.open, _prev.close) - _prev.low) / (_prev.high - _prev.low);
            var prev_power = prev_up_power - prev_down_power + prev_day_power;
            _prev['power'] = real_rows[i - 2]['volume'] * prev_power / item.stock_total * 100;;
            real_rows[i - 1]['prev_power'] = _prev['power']

            var day_power = (_curr.close - _curr.open) / (_curr.high - _curr.low);
            var down_power = (_curr.high - Math.min(_curr.open, _curr.close)) / (_curr.high - _curr.low);
            var up_power = (Math.max(_curr.open, _curr.close) - _curr.low) / (_curr.high - _curr.low);
            var power = up_power - down_power + day_power;
            real_rows[i - 1]['power'] = real_rows[i - 1]['volume'] * power / item.stock_total * 100;

            if (result.init_trend < 0 && prev_result.curr_trend < 0 && result.curr_trend > 0) {
              const period = 60;
              var org_rows = [...real_rows].slice(i - period - 1, i);
              var short_ma = new SMA({ period: 20, values: [...real_rows].slice(i - 20 - period, i).map((d) => d.close) }).result;
              var long_ma = new SMA({ period: 60, values: [...real_rows].slice(i - 60 - period, i).map((d) => d.close) }).result;

              var test = short_ma.map((d, i) => {
                return {
                  idx: i,
                  short: d,
                  long: long_ma[i],
                  close: org_rows[i].close,
                  open: org_rows[i].open,
                  high: org_rows[i].high,
                  low: org_rows[i].low,
                  date: org_rows[i].date
                }
              })
              var gold_cross = [];
              var reverse_cross = [];

              test.reduce((prev, curr) => {
                if (prev.short < prev.long && curr.short > curr.long) {
                  gold_cross.push(curr);
                }

                if (prev.short > prev.long && curr.short < curr.long) {
                  reverse_cross.push(curr);
                }
                return curr
              })

              // var total_vol = new SMA({ period: 400, values: [...real_rows].slice(i - 400 - period, i - period).map((d) => d.volume) }).result[0];
              // var period_vol = new SMA({ period: period, values: [...real_rows].slice(i - period, i).map((d) => d.volume) }).result[0];
              if (gold_cross.length > reverse_cross.length && test[test.length - 1].short > test[test.length - 2].short && test[test.length - 1].short > test[test.length - 1].long) {
                if (support.length + future_resist.length >= resist.length + future_support.length) {
                  if (true) {
                    var total_max = [...real_rows].slice(i - 400, i - period).reduce(function (prev, curr) {
                      return prev.volume > curr.volume ? prev : curr
                    })
                    var period_arr = [...real_rows].slice(i - period, i)
                    var period_max = period_arr.reduce(function (prev, curr) {
                      return prev.volume > curr.volume ? prev : curr
                    })


                    var period_max_idx = period_arr.indexOf(period_max);
                    var cnt = 0;
                    var low_range = 0;
                    var high_range = 0;
                    var start_up;

                    for (var h = period_max_idx; h > 0; h--) {
                      low_range += test[h].low;
                      high_range += test[h].high;
                      cnt++;
                      if (test[h - 1].short > test[h - 1].close) {
                        start_up = test[h - 1];
                        break;
                      }
                    }
                    low_range = ((low_range / cnt) + gold_cross[gold_cross.length - 1].close) / 2;
                    high_range = ((high_range / cnt) + gold_cross[gold_cross.length - 1].close) / 2;
                    if (start_up && gold_cross[gold_cross.length - 1].idx < period_max_idx) {
                      var period_day_power = (period_max.close - period_max.open) / (period_max.high - period_max.low);
                      var period_down_power = (period_max.high - Math.min(period_max.open, period_max.close)) / (period_max.high - period_max.low);
                      var period_up_power = (Math.max(period_max.open, period_max.close) - period_max.low) / (period_max.high - period_max.low);
                      var period_power = period_up_power - period_down_power + period_day_power;
                      var period_power_rate = real_rows[i - 1]['volume'] * period_power / item.stock_total * 100;
                      real_rows[i - 1]['period_power'] = period_power_rate

                      if (total_max && period_max && total_max.volume < period_max.volume && cnt <= period - period_max_idx && (period_max_idx - gold_cross[gold_cross.length - 1].idx) <= (period - period_max_idx) && period_max.high > _curr.close && high_range > _prev.close) {
                        console.log(true)
                        real_rows[i - 1]['period'] = period;

                        real_rows[i - 1]['buy_range'] = [Math.floor(high_range), Math.floor(low_range)];
                        real_rows[i - 1]['bottom_cut'] = low_range;

                        real_rows[i - 1]['total_max'] = total_max.volume;
                        real_rows[i - 1]['total_max_close'] = total_max.close;
                        real_rows[i - 1]['period_max'] = period_max.volume;
                        real_rows[i - 1]['period_max_close'] = period_max.close;
                        // real_rows[i - 1]['gold_cross'] = gold_cross;
                        // real_rows[i - 1]['reverse_cross'] = reverse_cross;

                        real_rows[i - 1]['marker'] = '매수';
                      }
                    }
                  }
                }
                if (real_rows[i - 1]['marker'].includes('매수')) {
                  origin_data.push(real_rows[i - 1])
                }
              }

            }


          }

          for (var i = real_rows.length - days; i <= real_rows.length - days; i++) {
            var curr_rows = [...real_rows].slice((i - 800 < 0 ? 0 : i - 800), i)

            if (curr_rows.length == 800 && i > 0) {
              get_signal(curr_rows)
            }
          }
        }).finally(() => {
          next(i + 1);
        })

      }

      next(0)
    })
  })
}

function pricing_func(date) {
  var data = new stock.db.dao.Stock();
  var list = new stock.db.dao.StockList();

  return new Promise((resolve) => {
    var list_path = path.resolve(__dirname, './store/_list_' + date + '.json');
    if (!fs.existsSync(list_path)) {
      resolve();
      return;
    } else {
      var d = JSON.parse(fs.readFileSync(list_path));
      var _list = {};
      var codes = d.map((d) => {
        _list[d.code] = d;
        return d.code
      })

      list.select().whereIn('stock_code', codes).then((items) => {

        progress_bar.start(items.length, 0);
        function next(i) {
          var origin_data = [];
          if (items.length == i) {
            progress_bar.stop();
            resolve();
            return;
          }

          progress_bar.update(i + 1);
          var item = items[i]
          data.table_name = 'stock_' + item.stock_code

          var sma_support = new SMA({ period: 5, values: [] });
          var sma_resist = new SMA({ period: 5, values: [] });
          var sma_close = new SMA({ period: 20, values: [] });
          var lma_close = new SMA({ period: 60, values: [] });
          data.select().where('date', '<=', _list[item.stock_code].date).orderBy('date', 'asc').then((real_rows) => {

            function get_signal(rows, k) {
              var pick = rows[rows.length - 1];
              if (!pick) return
              var result = {
                name: item.stock_name,
                total: item.stock_total,
                close: pick.close,
                date: moment(pick.date).format('YYYY-MM-DD'),
                curr_trend: 0,
                init_trend: 0,
                segmentation: [],
                upward_point: [],
                downward_point: [],
              };
              console.log(rows.length)
              segmentation(rows, result);

              var cross = [];
              result.upward_point.forEach((up) => {
                result.downward_point.forEach((down) => {
                  var test = getLineIntersect(up, up.diff / 86400000, down, down.diff / 86400000);
                  if (test.close >= up.close && test.close <= down.close) {
                    test['date'] = moment(test['date']).format('YYYY-MM-DD')
                    cross.push(test);
                  }
                })
              })

              var resist = cross.filter((d) => {
                return d.close > pick.close && moment(pick.date) > moment(d.date)
              })
              var future_resist = cross.filter((d) => {
                return d.close > pick.close && moment(pick.date) < moment(d.date)
              })

              var support = cross.filter((d) => {
                return d.close < pick.close && moment(pick.date) > moment(d.date)
              })
              var future_support = cross.filter((d) => {
                return d.close < pick.close && moment(pick.date) < moment(d.date)
              })

              if (resist.length > 0) {
                var min_resist = resist.reduce(function (prev, curr) {
                  return (prev.close < curr.close) ? prev : curr
                })

                var real = real_rows.filter((d) => moment(min_resist.date) <= moment(d.date))

                min_resist['real_close'] = real[0].close;
                min_resist['real_open'] = real[0].open;
                min_resist['real_high'] = real[0].high;
                min_resist['real_low'] = real[0].low;
                min_resist['date'] = moment(real[0].date).format('YYYY-MM-DD');

                // price_anal['min_resist'] = min_resist
                real_rows[k]['resist'] = min_resist['real_close'];
                real_rows[k]['min_resist'] = min_resist;
              }

              if (support.length > 0) {
                var max_support = support.reduce(function (prev, curr) {
                  return (prev.close > curr.close) ? prev : curr
                })

                var real = real_rows.filter((d) => moment(max_support.date) <= moment(d.date))

                max_support['real_close'] = real[0].close;
                max_support['real_open'] = real[0].open;
                max_support['real_high'] = real[0].high;
                max_support['real_low'] = real[0].low;
                max_support['date'] = moment(real[0].date).format('YYYY-MM-DD');

                // price_anal['max_support'] = max_support;

                real_rows[k]['support'] = max_support['real_close'];
                real_rows[k]['max_support'] = max_support
              }

              if (!real_rows[k].resist && k > 1) {
                real_rows[k].resist = real_rows[k - 1].resist
                real_rows[k].min_resist = real_rows[k - 1].min_resist
              }
              if (!real_rows[k].support && k > 1) {
                real_rows[k].support = real_rows[k - 1].support;
                real_rows[k].max_support = real_rows[k - 1].max_support;
              }
              real_rows[k]['upward_point'] = result.upward_point.length;
              real_rows[k]['downward_point'] = result.downward_point.length;
              real_rows[k]['cross_support'] = support.length;
              real_rows[k]['cross_resist'] = resist.length;
              real_rows[k]['future_support'] = future_support.length;
              real_rows[k]['future_resist'] = future_resist.length;
              real_rows[k]['segmentation'] = result.segmentation.length;
              real_rows[k]['init_trend'] = result.init_trend;
              real_rows[k]['curr_trend'] = result.curr_trend;

              if (real_rows[k].support) {
                var ma_support = sma_support.nextValue(real_rows[k].support);
                if (ma_support) {
                  real_rows[k]['ma_support'] = ma_support
                }
              }

              if (real_rows[k].resist) {
                var ma_resist = sma_resist.nextValue(real_rows[k].resist);
                if (ma_resist) {
                  real_rows[k]['ma_resist'] = ma_resist
                }
              }

              var ma_close = sma_close.nextValue(real_rows[k].close);
              if (ma_close) {
                real_rows[k]['ma_close'] = ma_close
              }

              var lma = lma_close.nextValue(real_rows[k].close);
              if (lma) {
                real_rows[k]['lma_close'] = lma
              }

              var _curr = real_rows[k];

              var day_power = (_curr.close - _curr.open) / (_curr.high - _curr.low)
              var down_power = (_curr.high - _curr.close) / (_curr.high - _curr.low);
              var up_power = (_curr.close - _curr.low) / (_curr.high - _curr.low);
              var power = (up_power) - (down_power / 2) + day_power;

              real_rows[k]['volume'] = real_rows[k]['volume'] * power;
              real_rows[k]['power'] = real_rows[k]['volume'] / item.stock_total * 100;

              real_rows[k]['date_format'] = moment(real_rows[k]['date']).format('YYYY-MM-DD')
              origin_data.push(real_rows[k])
            }


            var start_idx = real_rows.length - 300 < 0 ? 0 : real_rows.length - 300;
            for (var g = start_idx; g <= real_rows.length - 1; g++) {
              var curr_rows = [...real_rows].slice((g - 480 < 0 ? 0 : g - 480), g)
              get_signal(curr_rows, g)
            }

          }).finally(() => {
            // var list_path = path.resolve(__dirname, './_list.json');
            var exists = fs.existsSync(list_path)
            if (exists) {
              var old_list = JSON.parse(fs.readFileSync(list_path));
              old_list = old_list.map((d) => {
                if (d.code == item.stock_code) {
                  d['ma_close'] = origin_data[origin_data.length - 1].ma_close
                  d['ma_resist'] = origin_data[origin_data.length - 1].ma_resist
                  d['ma_support'] = origin_data[origin_data.length - 1].ma_support
                }
                return d
              })
              fsPath.writeFileSync(list_path, JSON.stringify(old_list, null, 2))
            }

            var origin_path = path.resolve(__dirname, './store/_pricing_' + item.stock_code + '.json');
            fsPath.writeFileSync(origin_path, JSON.stringify(origin_data, null, 2))
            next(i + 1);
          })
        }
        next(0)
      })
    }

  })
}

// slope(기울기) : y이동량 / x이동량
function getLineIntersect(point1, slope1, point2, slope2) {
  var intersectX = 0,
    intersectY = 0;

  // x = (m1x1 - m2x2 + y2 - y1) / (m1 - m2)
  intersectX = ((slope1 * point1.date) - (slope2 * point2.date) + point2.close - point1.close)
    / (slope1 - slope2);
  // y = m1(x - x1) + y1
  intersectY = slope1 * (intersectX - point1.date) + point1.close;

  var result = {
    date: intersectX,
    close: intersectY,
    volume: (point1.avg_volume + point2.avg_volume) / 2,
  }

  return result;
}

function trend_analysis(data, result, trend_type, firstValue) {
  if (data.length > 1) {
    var start_x = data[0].date / 1000000;
    var start_y = data[0].close;
    var end_x = data[data.length - 1].date / 1000000;
    var end_y = data[data.length - 1].close;
    var std_degree = Math.atan2(Math.abs(end_y - start_y), Math.abs(end_x - start_x)) * 180 / Math.PI;

    var min_idx = null;
    var min_degree = 0;
    var diff = 0;
    var _cnt = 0;
    var _volume = 0;
    var _close = 0;
    data.forEach((d, i) => {

      var dynamic_x = d.date / 1000000;
      var dynamic_y = d.close;
      var dynamic_degree = Math.atan2(Math.abs(dynamic_y - start_y), Math.abs(dynamic_x - start_x)) * 180 / Math.PI;
      _volume += d.volume;
      _cnt++;
      if (std_degree > dynamic_degree && dynamic_degree != 0) {
        if (min_degree > 0) {
          if (dynamic_degree < min_degree) {
            _close = dynamic_y;
            min_degree = dynamic_degree;
            diff = (dynamic_y - firstValue) / _cnt
            min_idx = i;
          }
        } else {
          _close = dynamic_y;
          min_degree = dynamic_degree
          diff = (dynamic_y - firstValue) / _cnt
          min_idx = i;
        }
      }
    })

    if (min_idx) {
      result[trend_type + '_point'].push({ avg_volume: _volume / _cnt, degree: min_degree, high: data[min_idx].high, low: data[min_idx].low, close: _close, diff: diff, date: data[min_idx].date, seg_idx: result.segmentation.length })
      // result.curr_point.push({ avg_volume: _volume / _cnt, degree: min_degree, high: _high, low: _low, close: _close, diff: diff, date: moment(data[min_idx].date).format('YYYY-MM-DD') })
      trend_analysis(data.slice(min_idx, data.length), result, trend_type, data[min_idx].close)
    }
  }
}

function segmentation(data, result) {
  if (data.length > 1) {
    const max = data.reduce(function (prev, curr) {
      return prev.close > curr.close ? prev : curr
    })

    const min = data.reduce(function (prev, curr) {
      return prev.close < curr.close ? prev : curr
    })

    const trend_type = max.date > min.date ? 'upward' : 'downward';
    var min_idx = data.indexOf(min);
    var max_idx = data.indexOf(max);
    if (!result.init_trend) result.init_trend = trend_type == 'upward' ? 1 : -1;

    switch (trend_type) {
      case 'upward':
        // if (result.curr_trend == 'downward') {
        //   result.prev_point = [...result.curr_point]
        //   result.curr_point = [];
        // }

        trend_analysis([...data].slice(min_idx, max_idx), result, trend_type, min.close);
        data = data.slice(max_idx)
        result.curr_trend = trend_type == 'upward' ? 1 : -1
        result.segmentation.push({
          from: min, to: max, type: trend_type
        })

        break;
      case 'downward':
        // if (result.curr_trend == 'upward') {
        //   result.prev_point = [...result.curr_point]
        //   result.curr_point = [];
        // }

        trend_analysis([...data].slice(max_idx, min_idx), result, trend_type, max.close);
        data = data.slice(min_idx)
        result.curr_trend = trend_type == 'upward' ? 1 : -1;
        result.segmentation.push({
          from: max, to: min, type: trend_type
        })

        break;
    }

    segmentation(data, result);
  }
}
