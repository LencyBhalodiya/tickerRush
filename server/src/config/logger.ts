import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "./env.js";

export const logger = pino({
  level: config.isProduction ? "info" : "debug",
  transport: config.isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { singleLine: true },
      },
});

export const httpLogger = pinoHttp({
  logger,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
