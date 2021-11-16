/**
 * @license
 * Copyright 2019 Victor Dibia. https://github.com/victordibia
 * Anomagram - Anomagram: Anomaly Detection with Autoencoders in the Browser.
 * Licensed under the MIT License (the "License"); 
 * =============================================================================
 * This module trains a two layer autoencoder on the ECG5000 dataset and exports a trianed model
 * which is used in the React web application.
 */



// const tf = require('@tensorflow/tfjs');
const tf = require('@tensorflow/tfjs-node-gpu');
const _ = require('lodash');
const dataUtils = require("./utils/data.js")
const ae_model = require("./models/ae.js");
const path = require('path');

// Fetch data using data util
let trainEcg, testEcg;
[trainEcg, testEcg] = dataUtils.getEcgData()

let trainStock, testStock;
[trainStock, testStock] = dataUtils.getStockData()

let modelParams = {
  numFeatures: trainStock[0].data.length,
  hiddenLayers: 2,
  latentDim: 2,
  hiddenDim: [7, 3],
  learningRate: 0.01,
  adamBeta1: 0.5
}

let numSteps = 10000;
let numEpochs = 1
let batchSize = 512

let modelSavePath = path.resolve(__dirname, './ae_model')

let model, encoder, decoder
[model, encoder, decoder] = ae_model.buildModel(modelParams)
encoder.summary()
decoder.summary()
model.summary()



console.log(" >> Train/Test Split | Train:", trainStock.length, " Test:", testStock.length);
// console.log(" >> Features per data point ", ecg[0].data.length)
// console.log(trainEcg[0]);


const xs = tf.tensor2d(trainStock.map(item => item.data
), [trainStock.length, trainStock[0].data.length])

let valid = testStock.map(item => item.data);
const xsTest = tf.tensor2d(valid, [valid.length, valid[0].length])

yTest = testStock.map(item => item.target + "" === 1 + "" ? 0 : 1)



// console.log(xs, xsTest);

function getPredictions() {
  let preds = model.predict(xsTest, { batchSize: batchSize })

  const mse = tf.tidy(() => {
    return tf.sub(preds, xsTest).square().mean(1)
  })
  // let mse = tf.sub(preds, this.xsTest).square().mean(1) //tf.losses.meanSquaredError(preds, xsTest)
  let mseDataHolder = []
  mse.array().then(array => {
    array.forEach((element, i) => {
      // console.log({ "mse": element, "label": yTest[i] });
      mseDataHolder.push({ "mse": element, "label": this.yTest[i] })
      // console.log(mseDataHolder.length)
    });
    computeAccuracyMetrics(mseDataHolder)
    metrics = mseDataHolder;
  });
  // let encoderPredictions = encoder.predict(this.xsTest)

  // let encPredHolder = []
  // encoderPredictions.array().then(array => {
  //   array.forEach((element, i) => {
  //     encPredHolder.push({ x: element[0], y: element[1], "label": this.yTest[i] })
  //   });
  // })
}

let best_acc = 0;;
async function train_data(model) {
  for (let i = 0; i < numSteps; i++) {
    startTime = new Date();
    const res = await model.fit(xs,
      xs, { epochs: numEpochs, verbose: 0, batchSize: batchSize, validationData: [xsTest, xsTest] });
    endTime = new Date();
    elapsedTime = (endTime - startTime) / 1000
    getPredictions();
    console.log("Step loss", i, res.history.loss[0], res.history.val_loss[0], bestMetric.acc, bestMetric.tpr, bestMetric.tnr);

    if (bestMetric.tnr > 0.98 && bestMetric.tpr > 0.98) {
      console.log('early stopping')
      break;
    }

  }

  console.log('best : ', best_acc);

  // var prev_metric;
  // for (var i = minThreshold; i <= maxThreshold; i += ((maxThreshold - minThreshold) / 100)) {
  //   let metric = computeAccuracyGivenThreshold(metrics, i);
  //   if (metric.fn == 0) {
  //     console.log(i);
  //   }
  //   prev_metric = metric
  // }
  console.log(bestMetric);

  await model.save("file://" + modelSavePath);
}


function computeAccuracyGivenThreshold(data, threshold) {
  let predVal = 0
  let truePositive = 0
  let trueNegative = 0
  let falsePositive = 0
  let falseNegative = 0

  data.forEach(each => {
    predVal = each.mse > threshold ? 1 : 0
    if ((each.label === 1) && (predVal === 1)) {
      truePositive++
    }
    if ((each.label === 0) && (predVal === 0)) {
      trueNegative++
    }

    if ((each.label === 0) && (predVal === 1)) {
      falsePositive++
    }

    if ((each.label === 1) && (predVal === 0)) {
      falseNegative++
    }
  });

  let metricRow = {
    acc: (truePositive + trueNegative) / data.length,
    threshold: threshold,
    tp: truePositive,
    tn: trueNegative,
    fp: falsePositive,
    fn: falseNegative,
    tpr: truePositive / (truePositive + falseNegative),
    fpr: falsePositive / (trueNegative + falsePositive),
    fnr: falseNegative / (truePositive + falseNegative),
    tnr: trueNegative / (trueNegative + falsePositive),
    precision: truePositive / (truePositive + falsePositive) || 0,
    recall: truePositive / (truePositive + falseNegative)
  }
  return metricRow
}

let metrics;
let bestMetric = { acc: 0, fpr: 0, fnr: 0, tnr: 0, tpr: 0, threshold: 0, precision: 0, recall: 0 };
let minThreshold = 0;
let maxThreshold = 1;
function computeAccuracyMetrics(data) {
  let uniqueMse = _.uniq(_.map(data, 'mse'))

  uniqueMse = _(uniqueMse).sortBy().value()
  uniqueMse.reverse()

  let rocMetricHolder = []
  let rocSum = 0
  let prevMetric = { fpr: 0, tpr: 0 }

  uniqueMse.forEach((each, i) => {
    let metric = computeAccuracyGivenThreshold(data, each)

    rocMetricHolder.push(metric)
    // if (i < uniqueMse.length) {
    // rocSum += (prevMetric.tpr) * (metric.fpr - prevMetric.fpr)
    rocSum += ((prevMetric.tpr + metric.tpr) / 2) * (metric.fpr - prevMetric.fpr)
    // console.log(i, rocSum);
    // }
    prevMetric = metric

  });

  // Add point (1,1) to compute AUC
  // use trapezium area rule to calculate area
  if (prevMetric.fpr !== 1) {
    rocMetricHolder.push({ fpr: 1, tpr: prevMetric.tpr })
    rocSum += ((prevMetric.tpr + 1) / 2) * (1 - prevMetric.fpr)
    // rocSum += prevMetric.tpr * (1 - prevMetric.fpr)
  }

  bestMetric = _.maxBy(rocMetricHolder, "acc")

  minThreshold = _.min(uniqueMse);
  maxThreshold = _.max(uniqueMse);
}

let out_hold = []

async function main(model) {
  await train_data(model);

  // let preds = await model.predict(xsTest)
  // console.log(xsTest.shape, preds.shape)
  // mse = tf.tidy(() => {
  //   return tf.sub(preds, xsTest).square().mean(1)
  // })

  // let mseDataHolder = []
  // mse.array().then(array => {
  //   let mseData = [];
  //   array.forEach((element, i) => {
  //     // console.log({ "mse": element, "label": yTest[i] });
  //     mseDataHolder.push({ "mse": element, "label": this.yTest[i] })
  //     mseData.push({ "mse": element, "label": this.yTest[i] })
  //   });
  //   computeAccuracyMetrics(mseData)
  // });
  // console.log(bestMetric)
  // //  

  // console.log("mse", mse.shape);
}

async function loadSavedModel() {
  model = await tf.loadLayersModel(modelSavePath + "/model.json");
  console.log("model loaded");

  // const ae = tf.model({ inputs: input, outputs: output, name: "autoencoder" })
  const optimizer = tf.train.adam(modelParams.learningRate, modelParams.adamBeta1)

  model.compile({ optimizer: optimizer, loss: "meanSquaredError" })

  for (let i = 0; i < numSteps; i++) {
    const res = await model.fit(xs,
      xs, { epochs: numEpochs, verbose: 0, batchSize: batchSize });
    console.log("Step loss", i, res.history.loss[0]);
  }

  await model.save(modelSavePath);
  await model.save("file://../app/public/webmodel/ecg");
}

// loadSavedModel()
getPredictions();
main(model)