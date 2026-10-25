import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error(error);

  if (error instanceof ZodError) {
    res.status(422).json({ code: "VALIDATION_ERROR", errors: error.flatten() });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  res.status(500).json({ code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" });
};
