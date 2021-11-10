const fs = require('fs');
const path = require('path');

const cmd = require('commander');
cmd.option('-m, --mode [mode]', 'set mode', 'development')
  .option('-c, --conf [conf]', 'set config', './config.json')
  .parse(process.argv);

// 사용자 정의 config
var relative_path = path.relative(__dirname, './');
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, relative_path, cmd.conf), 'utf8'));
config.root_path = path.resolve(__dirname, relative_path, config.root_path);
process.env.root_path = config.root_path;

process.env.google_id = config.google_auth.id;
process.env.google_secret = config.google_auth.secret;
process.env.google_domain = config.google_auth.domain;

process.env.smtp = config.smtp;

module.exports = config;
