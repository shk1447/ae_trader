const _ = require("lodash");
const tf = require("@tensorflow/tfjs-node-gpu");

let buildModel = function (params) {
  const inputShape = params.inputShape; // 예: [28, 28, 1] for MNIST
  const latentDim = params.latentDim;
  const learningRate = params.learningRate, // 0.001 ~ 0.0001
    adamBeta1 = params.adamBeta1;
  const outputActivation = "sigmoid";
  const dropoutRate = params.dropoutRate; // Dropout 비율 추가 0.3

  // Specify encoder
  const input = tf.input({ shape: inputShape });
  let encoder = tf.layers
    .conv2d({ filters: 32, kernelSize: 3, padding: "same", activation: "relu" })
    .apply(input);
  encoder = tf.layers.batchNormalization().apply(encoder); // Batch Normalization 레이어 추가
  encoder = tf.layers.dropout({ rate: dropoutRate }).apply(encoder); // Dropout 레이어 추가
  encoder = tf.layers
    .maxPooling2d({ poolSize: [2, 2], strides: [2, 2] })
    .apply(encoder);
  encoder = tf.layers
    .conv2d({ filters: 64, kernelSize: 3, padding: "same", activation: "relu" })
    .apply(encoder);
  encoder = tf.layers.batchNormalization().apply(encoder); // Batch Normalization 레이어 추가
  encoder = tf.layers.dropout({ rate: dropoutRate }).apply(encoder); // Dropout 레이어 추가
  encoder = tf.layers
    .maxPooling2d({ poolSize: [2, 2], strides: [2, 2] })
    .apply(encoder);

  // Flatten the output and apply a dense layer to reach the latent space
  let flatten = tf.layers.flatten().apply(encoder);
  const z_ = tf.layers.dense({ units: latentDim }).apply(flatten);
  const encoderModel = tf.model({
    inputs: input,
    outputs: z_,
    name: "encoder",
  });

  // Specify decoder
  const latentInput = tf.input({ shape: [latentDim] });
  let decoder = tf.layers
    .dense({
      units: (inputShape[0] / 4) * (inputShape[1] / 4) * 64,
      activation: "relu",
    })
    .apply(latentInput);
  decoder = tf.layers.batchNormalization().apply(decoder); // Batch Normalization 레이어 추가
  decoder = tf.layers.dropout({ rate: dropoutRate }).apply(decoder); // Dropout 레이어 추가
  decoder = tf.layers
    .reshape({ targetShape: [inputShape[0] / 4, inputShape[1] / 4, 64] })
    .apply(decoder);

  decoder = tf.layers
    .conv2dTranspose({
      filters: 64,
      kernelSize: 3,
      strides: 2,
      padding: "same",
      activation: "relu",
    })
    .apply(decoder);
  decoder = tf.layers.batchNormalization().apply(decoder); // Batch Normalization 레이어 추가
  decoder = tf.layers
    .conv2dTranspose({
      filters: 32,
      kernelSize: 3,
      strides: 2,
      padding: "same",
      activation: "relu",
    })
    .apply(decoder);
  decoder = tf.layers.batchNormalization().apply(decoder); // Batch Normalization 레이어 추가
  const decoderOutput = tf.layers
    .conv2d({
      filters: inputShape[2],
      kernelSize: 3,
      padding: "same",
      activation: outputActivation,
    })
    .apply(decoder);

  const decoderModel = tf.model({
    inputs: latentInput,
    outputs: decoderOutput,
    name: "decoder",
  });

  // Construct AE with both encoder and decoder
  const output = decoderModel.apply(encoderModel.apply(input));
  const ae = tf.model({ inputs: input, outputs: output, name: "autoencoder" });
  const optimizer = tf.train.adam(learningRate, adamBeta1);

  ae.compile({ optimizer: optimizer, loss: "meanSquaredError" });

  return [ae, encoderModel, decoderModel];
};

// 이미지 로드 및 전처리 함수
async function processImage(imagePath) {
  const imageBuffer = await sharp(imagePath)
    .resize(400, 600)
    .toColourspace("srgb")
    .toBuffer();
  let tensor = tf.node
    .decodeImage(imageBuffer, 3)
    .toFloat()
    .div(tf.scalar(255.0))
    .expandDims();
  return tensor;
}

// 폴더에서 이미지 로드 함수
async function loadImagesFromFolder(folderPath) {
  const imageFiles = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".png"));
  const imageTensors = [];
  for (let file of imageFiles) {
    const imgTensor = await processImage(path.join(folderPath, file));
    imageTensors.push(imgTensor);
  }
  return tf.concat(imageTensors);
}

module.exports = {
  buildModel: buildModel,
};
