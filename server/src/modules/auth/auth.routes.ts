import { Router } from "express";
import { validateBody } from "../../common/middleware/validate.js";
import { refresh, signIn, signUp } from "./auth.controller.js";
import { refreshTokenSchema, signInSchema, signUpSchema } from "./auth.validation.js";

export const authRouter = Router();

authRouter.post("/signup", validateBody(signUpSchema), signUp);
authRouter.post("/signin", validateBody(signInSchema), signIn);
authRouter.post("/refresh", validateBody(refreshTokenSchema), refresh);
