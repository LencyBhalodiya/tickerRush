import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../../common/errors/app-error.js";
import { validateBody } from "../../common/middleware/validate.js";
import { refresh, signIn, signUp } from "./auth.controller.js";
import { refreshTokenSchema, signInSchema, signUpSchema } from "./auth.validation.js";

export const authRouter = Router();

// ponytail: in-memory store is per process; switch to rate-limit-redis once running more than one instance.
authRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, "Too many requests, please try again later", "RATE_LIMITED"));
    },
  }),
);

authRouter.post("/signup", validateBody(signUpSchema), signUp);
authRouter.post("/signin", validateBody(signInSchema), signIn);
authRouter.post("/refresh", validateBody(refreshTokenSchema), refresh);
