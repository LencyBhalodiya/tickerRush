import cookieParser from "cookie-parser";
import { Router } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { AppError } from "../../common/errors/app-error.js";
import { validateBody } from "../../common/middleware/validate.js";
import { logout, refresh, signIn, signUp } from "./auth.controller.js";
import { signInSchema, signUpSchema } from "./auth.validation.js";

// ponytail: in-memory store is per process; switch to rate-limit-redis once running more than one instance.
function limiter(limit: number, options: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, "Too many requests, please try again later", "RATE_LIMITED"));
    },
    ...options,
  });
}

// Count failed sign-ins only. These run after validation, so the email is already trimmed and lowercased.
const signInLimiters = [
  // Guessing one account's password from one IP.
  limiter(5, {
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${req.body.email}`,
  }),
  // Guessing one account's password from many IPs. Trade-off: anyone can lock an email out of sign-in for one window.
  limiter(10, { skipSuccessfulRequests: true, keyGenerator: (req) => req.body.email }),
];

export const authRouter = Router();

// Only the auth routes read cookies: the refresh_token cookie is scoped to this path.
authRouter.use(limiter(20), cookieParser());

authRouter.post("/signup", validateBody(signUpSchema), signUp);
authRouter.post("/signin", validateBody(signInSchema), signInLimiters, signIn);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
