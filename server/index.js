const fs = require('fs');
const path = require('path');
const _ = require('lodash');

const net = require('net');
const http = require('http');
const https = require('https');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const busboy = require("connect-busboy");
const bodyParser = require('body-parser');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');

const session = require('express-session');
const KnexSessionStore = require('connect-session-knex')(session);
const passport = require('passport');

const cluster = require('cluster');
const os = require('os');

var config = require('./configure.js');
const route = require('./routes');

const logger = require('./utils/logger');
const network = require('./network');

// var nodemailer = require('nodemailer');
// var transport = nodemailer.createTransport(process.env.smtp);

// global object
global._ = require('lodash');
global.vases = {
  LightWS: null,
  session_store: null,
  logger: logger,
  config:config
  //transport:transport
}

const connector = require('./connector');

if (process.env.PORT) config.port = process.env.PORT;
if (process.env.HOST) config.proxy = process.env.HOST;
if (process.env.DB_HOST) config.database[config.database.type].host = process.env.DB_HOST;
if (process.env.DB_NAME) config.database[config.database.type].database = process.env.DB_NAME;

module.exports = (async (config) => {
  var service = function () {
    vases.session_store = new KnexSessionStore({
      knex: connector.database,
      createtable: false,
      tablename: 'session'
    });
    
    var app = express();

    app.set('view cache', true);
    app.use('/', express.static(path.resolve(config.root_path, '../dist')))
    app.use(helmet());
    app.use(helmet.xssFilter());
    app.disable('x-powered-by');
    app.use(cors());
    app.use(compression());
    app.use(fileUpload({}));
    app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
    app.use(bodyParser.json({ limit: '100mb' }));
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: false, limit: '100mb', parameterLimit: 1000000 }));
    app.use(express.json());
    app.use(session({
      key: 'vases_sid',
      secret: 'vases',
      cookie: {
        maxAge: 1000 * 60 * config.session_time
      },
      saveUninitialized: false,
      resave: false,
      store: vases.session_store,
      rolling: true
    }))

    app.use(passport.initialize());
    app.use(passport.session());

    route(app, config);
    if (config.proxy) app.use('/', proxy(config.proxy))

    const expressSwagger = require('express-swagger-generator')(app);
    let options = {
      swaggerDefinition: {
        info: {
          description: 'Trading Server by AutoEncoder',
          title: 'Swagger',
          version: '1.0.0',
        },
        host: 'localhost:8081',
        basePath: '/',
        produces: [
          "application/json",
        ],
        consumes: [
          "multipart/form-data",
          "application/json",
        ],
        schemes: ['http', 'https'],
      },
      basedir: __dirname, //app absolute path
      files: ['./routes/api/**/*.js'] //Path to the API handle folder
    };
    expressSwagger(options)

    var server = http.createServer(app);

    server.addListener("error", (err) => {
      console.log(err);
      vases.logger.error(err.message);
    });

    ClusterServer = {
      name: 'ClusterServer',
      cpus: os.cpus().length,
      autoRestart: true,
      start: function (server, port, host) {
        var me = this,
          i;

        function eachWorker(callback) { for (var id in cluster.workers) { callback(cluster.workers[id]); } }
        if (cluster.isMaster) {
          if (config.database.type === 'sqlite3') {
            var db_path = path.resolve(process.env.root_path, config.database[config.database.type].filename);
            if (!fs.existsSync(db_path)) {
              fs.writeFileSync(db_path, '', { flag: 'w' })
            }
          }

          for (i = 0; i < me.cpus; i += 1) {
            var worker = cluster.fork();

            worker.on('message', function (msg) {
              eachWorker(function (_worker) {
                _worker.send(msg);
              })
            })
          }

          cluster.on('death', function (worker) {
            vases.logger.warn(me.name + ': worker ' + worker.pid + ' died.')
            if (me.autoRestart) {
              vases.logger.warn(me.name + ' Restarting worker thread...')
              cluster.fork();
            }
          });
        } else {
          vases.LightWS = network.LightWS(server)
          var getAction = function (obj, path) {
            var count = 0;
            var path_arr = path.split('.')
            var result = path_arr.reduce(function (d, index) {
              count++;

              return d[index]
            }, obj)
            return result;
          };
          process.on("message", function (msg) {
            var action_func = getAction(vases, msg.action);
            console.log(action_func);
            console.log(msg.args);
            try {
              action_func.apply(null, msg.args);
            } catch (error) {
              console.log(error);
            }
          })

          server.listen(port, host, function () {
            vases.logger.info(me.name + ' starting worker thread #' + cluster.worker.id);
          }).on('error', function (err) {
            console.log(err);
            vases.logger.error(err.message);
          })
        }
      }
    }

    ClusterServer.name = 'vases_cluster';
    ClusterServer.start(server, config.port, config.host);
  };

  await connector.connect(config.database);
  connector.initialize();
  service();
})(config);
