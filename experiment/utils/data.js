/**
 * @license
 * Copyright 2019 Victor Dibia. https://github.com/victordibia
 * Anomagram - Anomagram: Anomaly Detection with Autoencoders in the Browser.
 * Licensed under the MIT License (the "License");
 * =============================================================================
 */

// load and return ecg data used to train model
const _ = require("lodash");
const fs = require("fs");
const path = require("path");

const getStockData = function () {
  let stockTrain = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../train2.json"))
  );
  let validStock = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../valid2.json"))
  );
  let testStock = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../test.json"))
  );

  // // Only usse normal data (target == 1) for training.
  // for (row in ecgTrain) {
  //     let val = ecgTrain[row]
  //     if (val.target + "" === 1 + "") {
  //         trainEcg.push(val)
  //     }
  // }
  // console.log("inliers", trainEcg.length, testEcg.length);
  return [_.shuffle(stockTrain), _.shuffle(validStock), _.shuffle(testStock)];
};

const getEcgData = function () {
  let ecgTrain = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "./data/ecg/train_scaled.json"))
  );
  let testEcg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "./data/ecg/test_scaled.json"))
  );
  let trainEcg = [];

  // Only usse normal data (target == 1) for training.
  for (row in ecgTrain) {
    let val = ecgTrain[row];
    if (val.target + "" === 1 + "") {
      trainEcg.push(val);
    }
  }
  console.log("inliers", trainEcg.length, testEcg.length);
  return [trainEcg, testEcg];
};

// Manage composition of test data
function subsetTestData(testData, maxTestData) {
  let maxCategories = { 1: 15, 2: 10, 3: 15, 4: 15, 5: 0 };
  let seenCategories = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let result = [];
  for (let i = 0; i < testData.length; i++) {
    let el = testData[i];
    if (seenCategories[el.target] < maxCategories[el.target]) {
      seenCategories[el.target] += 1;
      result.push(el);
    }
    if (result.length >= maxTestData) {
      break;
    }
  }
  return result;
}

module.exports = {
  getEcgData: getEcgData,
  getStockData: getStockData,
};
