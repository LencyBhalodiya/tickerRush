import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { verifyAccessToken } from "./auth.tokens.js";
import type { AuthenticatedUser, UserRole } from "./auth.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    next(new AppError(401, "Authentication is required", "UNAUTHENTICATED"));
    return;
  }

  try {
    req.auth = await verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new AppError(403, "You do not have permission to perform this action", "FORBIDDEN"));
      return;
    }
    next();
  };
}
