const LightWS = require("light-ws/server");
const stock = require("../../models/stock.json");
const session = require("express-session");
const connector = require("../connector");
module.exports = function (server) {
  const ws = new LightWS(stock);
  const sessionParser = session({
    key: "vases_sid",
    secret: "vases",
    cookie: {
      maxAge: 1000 * 60 * vases.config.session_time,
    },
    saveUninitialized: false,
    resave: true,
    store: vases.session_store,
    rolling: true,
  });

  ws.listen({ noServer: true, path: "/vases" }, server, function (type, ws) {
    console.log(type);
  });

  ws.on("stock/subscribe", async (data, client, req) => {
    sessionParser(req, {}, async () => {
      if (data && Array.isArray(data) && data.length > 0) {
        try {
          const stockFavorite = new connector.types.StockFavorite(
            connector.database
          );

          const rows = data.map((code) => {
            return {
              user_id: req.session.passport.user.id,
              code: code,
              meta: "{}",
            };
          });

          await stockFavorite
            .insert(rows)
            .onConflict(["code", "user_id"])
            .merge();

          if (!client["stock/subscribe"]) client["stock/subscribe"] = [];
          client["stock/subscribe"] = client["stock/subscribe"].concat(data);

          ws.response("stock/subscribe", client["stock/subscribe"], client);
        } catch (error) {
          console.log(error);
        }
      }
    });
  });

  ws.on("stock/unsubscribe", async (data, client, req) => {
    sessionParser(req, {}, async () => {
      try {
        if (data && Array.isArray(data) && data.length > 0) {
          const stockFavorite = new connector.types.StockFavorite(
            connector.database
          );

          await stockFavorite.delete({
            code: data[0],
            user_id: req.session.passport.user.id,
          });
          data.forEach((d) => {
            client["stock/subscribe"].splice(
              client["stock/subscribe"].indexOf(d),
              1
            );
          });
          ws.response("stock/unsubscribe", data, client);
        }
      } catch (error) {}
    });
  });

  return ws;
};
