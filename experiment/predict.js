const tf = require("@tensorflow/tfjs-node-gpu");
const _ = require("lodash");
const dataUtils = require("./utils/data.js");
const ae_model = require("./models/ae.js");
const path = require("path");
const { mainModule } = require("process");
const moment = require("moment");

let trainStock, validStock, testStock;
[trainStock, validStock, testStock] = dataUtils.getStockData();

let best_modelPath = path.resolve(__dirname, "./ae_model/model.json");

var result = {};
console.log(testStock.length, testStock[0].data.length);
async function main() {
  let best_model = await tf.loadLayersModel("file://" + best_modelPath);

  // const [worst_mse] = tf.tidy(() => {
  //   let dataTensor = tf.tensor2d(testStock.map(item => item.data), [testStock.length, testStock[0].data.length])
  //   let preds = worst_model.predict(dataTensor, { batchSize: 1 })
  //   return [tf.sub(preds, dataTensor).square().mean(1), preds]
  // })

  const [best_mse] = tf.tidy(() => {
    let dataTensor = tf.tensor2d(
      trainStock.map((item) => item.data),
      [trainStock.length, trainStock[0].data.length]
    );
    let preds = best_model.predict(dataTensor, { batchSize: 1 });
    return [tf.sub(preds, dataTensor).square().mean(1), preds];
  });

  // worst : 0.9460195899009705
  // best : 1.0003410577774048
  // let worst_array = await worst_mse.array();
  let best_array = await best_mse.array();

  let result_arr = trainStock.map((d, idx) => {
    console.log(best_array[idx]);
    return {
      code: d.code,
      best: best_array[idx],
      date: d.date,
    };
  });

  var aa = result_arr.filter((d) => d.best <= 0.49506646394729614);
  aa.forEach((d) => {
    console.log(d.code, moment(d.date).format("YYYY-MM-DD"));
  });
  console.log(aa.length);

  // array.filter((d) => d < 1.0003410577774048).forEach((item, idx) => {
  //   if (result[testStock[idx].code]) {
  //     result[testStock[idx].code]++;
  //   } else {
  //     result[testStock[idx].code] = 1;
  //   }
  //   console.log(testStock[idx].code, testStock[idx].date, testStock[idx].high, item)
  // })
}

main();

console.log(result);
