import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env.js";
import { httpLogger } from "./config/logger.js";
import { errorHandler, notFoundHandler } from "./common/errors/error.middleware.js";
import { apiRouter } from "./routes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(httpLogger);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
