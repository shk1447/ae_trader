// main service에서 제공하는 api 관리

const api = require('./api')

module.exports = function (app, config) {
  function ensureAuth(req, res, next) {
    if (req.isAuthenticated()) {
      next();
    } else {
      res.status(401).send();
    }
  }

  // api module loader
  _.each(api, (routes, path) => {
    _.each(routes, (funcs, routeName) => {
      _.each(funcs, (func, funcName) => {
        app[routeName]('/' + path + '/' + funcName, func);
      })
    })
  })
}
