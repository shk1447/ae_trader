const dfd = require("danfojs-node")
const fs = require('fs');
const path = require('path');
const fsPath = require('fs-path');
const moment = require('moment');
var { Chart } = require('echarts-ssr');
var clustering = require('density-clustering')

const SMA = require('technicalindicators').SMA

const Database = require('./utils/Database');
stock = {
  db: null
}
var train_data = [];
var valid_data = [];
var test_data = [];

function kmeans_clustering(dataset, cnt, orgs, success_list) {
  var isPerfect = false
  var ret;
  while (!isPerfect) {
    var result_list = [];
    var kmeans = new clustering.KMEANS();
    var clusters = kmeans.run(dataset, cnt)

    // var dbscan = new clustering.DBSCAN();
    // var clusters = dbscan.run(dataset, 15, 5)
    // console.log(clusters)

    for (var i = 0; i < clusters.length; i++) {
      var total = 0;
      var success = 0;
      var fail = 0;
      var list = [];
      var cluster = clusters[i];
      for (var j = 0; j < cluster.length; j++) {
        var idx = cluster[j];
        var item = orgs[idx];
        if (success_list.includes(item.code + item.date)) {
          success++
        } else {
          fail++
        }
        total++
        item['dataset'] = dataset[idx];
        list.push(item);
      }
      var percent = success / total * 100;
      if (percent > 90) {

      }
      //console.log(i + '번째 클러스터 : ', percent + '% / ', total)
      if (percent == 100) {
        result_list.push(list)
      }
    }
    if (result_list.length > 0) {
      var total = 0
      var max = 0;
      var max_idx;
      result_list.forEach((d, idx) => {
        total += d.length
        if (max < d.length) {
          max = d.length;
          max_idx = idx
        }
      })
      if (max > 10) {
        // [max_idx]
        ret = result_list[max_idx];
        isPerfect = true
      }
      console.log(max, total, result_list.length);
    }
  }
  return ret;
}

Database({
  "type": "sqlite3",
  "sqlite3": {
    "filename": "../server/trader.db"
  }
}).then((db) => {
  db.knex('stock_data').then((rows) => {
    var items = [];
    var success = [];
    var dataset = [];

    rows.forEach((d) => {

      let meta = JSON.parse(d.meta);


      let scaler = new dfd.StandardScaler()
      let df = new dfd.DataFrame([meta.insight.support, meta.insight.resist, meta.insight.future_support, meta.insight.future_resist])
      scaler.fit(df)
      let df_enc = scaler.transform(df);


      if (d.result) {
        dataset.push(df_enc.values)
        if (d.result > 105) {
          success.push(d.code + d.date);
        } else {
          valid_data.push({
            data: df_enc.values,
            target: 0
          })
        }
        items.push(d)
      } else {
        test_data.push({
          data: df_enc.values,
          result: d.result,
          code: d.code,
          date: d.date
        })
      }

      // let train = meta.train.filter((d) => d);
      // if(train.length == 120) {
      //   let scaler = new dfd.StandardScaler()
      //   let df = new dfd.DataFrame(train)
      //   scaler.fit(df)
      //   let df_enc = scaler.transform(df);
      //   dataset.push(df_enc.values)
      //   if(d.result > 105) {
      //     success.push(d.code + d.date)
      //   }
      //   items.push(d)
      // }
    })
    console.log(success.length, valid_data.length, dataset.length)
    var ret = kmeans_clustering(dataset, 5, items, success);
    ret.forEach((d, i) => {
      var _train_data = [];
      var test_result = 0

      test_result += d.result;
      train_data.push({
        data: d.dataset,
        target: 1
      })
      valid_data.push({
        data: d.dataset,
        target: 1
      })

    })
    fsPath.writeFileSync(path.resolve(__dirname, `./train.json`), JSON.stringify(train_data))
    fsPath.writeFileSync(path.resolve(__dirname, './valid.json'), JSON.stringify(valid_data))
    fsPath.writeFileSync(path.resolve(__dirname, './test.json'), JSON.stringify(test_data))
    // console.log(ret);
  })
})
