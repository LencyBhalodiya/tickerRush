import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { flattenError, ZodError } from "zod";
import { AppError } from "./app-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    req.log.warn({ errorCode: "VALIDATION_ERROR", errorMessage: "Request validation failed" }, "Request failed");
    res.status(422).json({ code: "VALIDATION_ERROR", errors: flattenError(error) });
    return;
  }

  if (error instanceof AppError) {
    req.log.warn({ errorCode: error.code, errorMessage: error.message }, "Request failed");
    res.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  // body-parser errors (malformed JSON, oversized body) carry their own 4xx status.
  const status = error?.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const code = STATUS_CODES[status]?.toUpperCase().replaceAll(" ", "_") ?? "BAD_REQUEST";
    req.log.warn({ errorCode: code, errorMessage: error.message }, "Request failed");
    res.status(status).json({ code, message: error.message });
    return;
  }

  req.log.error({ err: error }, "Unexpected request error");

  res.status(500).json({ code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" });
};
