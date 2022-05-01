const fs = require("fs");
const ora = require("ora");
const path = require("path");
const webpack = require("webpack");

const child_process = require("child_process");
const { Writable } = require("stream");

const cmd = require("commander");
cmd.option("-w, --watch", "set watch", false).parse(process.argv);

var package = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf8")
);
package.devDependencies = {};
package.dependencies = {
  knex: "2.0.0",
  "better-sqlite3": "7.5.1",
  mysql: "^2.18.1",
};
package.scripts = {
  start:
    "export NODE_ENV=production && node --max-old-space-size=4096 ./backend.js",
};

const CopyWebpackPlugin = require("copy-webpack-plugin");

var config = {
  watch: cmd.watch,
  entry: "./index.js",
  target: "node",
  output: {
    path: path.join(__dirname, "../dist"),
    filename: "./backend.js",
  },
  externals: {
    knex: "commonjs knex",
    pg: "commonjs pg",
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: path.resolve(__dirname, "./config.json"),
        to: path.resolve(__dirname, "../dist/config.json"),
      },
    ]),
  ],
};
const spinner = ora("building for production...");
spinner.start();

var child;
var wp = webpack(config, (err, stats) => {
  spinner.stop();
  if (stats.compilation.errors.length > 0) {
    console.log(stats.compilation.errors);
    console.log("build error! [" + stats.compilation.errors.length + "]");
  } else {
    fs.writeFileSync(
      path.resolve(__dirname, "../dist/package.json"),
      JSON.stringify(package, null, 2)
    );
    console.log("build complete");

    if (cmd.watch) {
      var command = "node";
      var args = ["./index.js"];
      var options = { cwd: "./" };
      child = child_process.spawn(command, args, options);

      child.stdout.pipe(
        new Writable({
          write(chunk, encoding, callback) {
            console.log(chunk.toString());
            callback();
          },
        })
      );
      child.on("exit", function () {
        console.log("process exit");
      });
    }
  }
});
if (cmd.watch) {
  wp.compiler.hooks.beforeCompile.tap({ name: "trader-dev" }, (a, b, c) => {
    child.kill();
    spinner.start();
  });
}
