import type { z } from "zod";
import type { refreshTokenSchema, signInSchema, signUpSchema } from "./auth.validation.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
