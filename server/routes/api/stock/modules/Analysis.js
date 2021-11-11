const moment = require('moment');
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

function trend(data, result, trend_type, firstValue) {
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
      trend(data.slice(min_idx, data.length), result, trend_type, data[min_idx].close)
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
        trend([...data].slice(min_idx, max_idx), result, trend_type, min.close);
        data = data.slice(max_idx)
        result.curr_trend = trend_type == 'upward' ? 1 : -1
        result.segmentation.push({
          from: min, min: min, max: max, type: trend_type
        })

        break;
      case 'downward':
        trend([...data].slice(max_idx, min_idx), result, trend_type, max.close);
        data = data.slice(min_idx)
        result.curr_trend = trend_type == 'upward' ? 1 : -1;
        result.segmentation.push({
          from: max, max: max, min: min, type: trend_type
        })

        break;
    }

    segmentation(data, result);
  }
}

function cross_point(result, pick) {
  let cross = []
  result.upward_point.forEach((up, up_idx) => {
    result.downward_point.forEach((down, down_idx) => {
      var test = getLineIntersect(up, up.diff / 86400000, down, down.diff / 86400000);
      var std = up.date > down.date ? up : down;
      if (test.close > result.segmentation[std.seg_idx].min.low && result.segmentation[std.seg_idx].max.high > test.close) {
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

  return {
    resist:resist.length,
    support: support.length,
    future_resist:future_resist.length,
    future_support:future_support.length
  }
}

module.exports = {
  cross_point: cross_point,
  segmentation: segmentation,
  getLineIntersect: getLineIntersect
}