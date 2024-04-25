var { UMAP } = require("umap-js");
var { DBSCAN } = require("density-clustering");
const fs = require("fs");
const path = require("path");
var KNN = require("ml-knn");
var _ = require("lodash");

let rawdata1 = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./train.json"))
);

let rawdata2 = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./valid.json"))
);

console.log();

const data = rawdata1.map((d) => d.data)

const umap = new UMAP();
const aa = [...data, ...data]
console.log(aa.length)
const epochs = umap.initializeFit(aa);

for (var i = 0; i < epochs; i++) {
  umap.step();
}

const embedding = umap.getEmbedding();

console.log(embedding.length);

// const dbscan = new DBSCAN();

// const clusters = dbscan.run(embedding, 5, 2);

// console.log(clusters.length, dbscan.noise);

// console.log(data);
// // const knn = new KNN(
// //   rawdata.map((d) => d.data),
// //   rawdata.map((d) => {
// //     return d.target > 1.2 ? 1 : 0;
// //   }),
// //   { k: 21 }
// // );

// // const test = knn.predict(rawdata.map((d) => d.data));

// // test.forEach((d, i) => {
// //   if (rawdata[i].target < 1.02) {
// //     console.log(rawdata[i].target, d);
// //   }
// // });
// //const meanScore = _.mean(rawdata.map((d) => d.data[100]));

// // console.log(meanScore);
// const dataset = rawdata.map((d) => {
//   return [d.data[4], d.data[5]];
// });

// var dbscan = new clustering.KMEANS();
// var clusters = dbscan.run(dataset, 22);
// clusters.forEach((d) => {
//   var fail = 0;
//   var success = 0;

//   d.forEach((j) => {
//     if (rawdata[j].target > 1.05) {
//       success++;
//     } else {
//       fail++;
//     }
//   });
//   console.log(d.length);
//   console.log(success / d.length);
// });

// // clusters[0].forEach((d) => {
// //   console.log(rawdata[d].target);
// // });
// // console.log(clusters[0].length);

// // // clusters[1].forEach((d) => {
// // //   console.log(rawdata[d].target);
// // // });
