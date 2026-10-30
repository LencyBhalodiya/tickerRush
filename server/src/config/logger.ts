import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "./env.js";

export const logger = pino({
  enabled: config.NODE_ENV !== "test",
  level: config.isProduction ? "info" : "debug",
  // Safety net in case a request body or document is ever logged, at the top level or one level deep.
  redact: ["password", "passwordHash", "token", "accessToken", "refreshToken"].flatMap((key) => [key, `*.${key}`]),
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
