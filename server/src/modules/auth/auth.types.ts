import type { z } from "zod";
import type { refreshTokenSchema, signInSchema, signUpSchema } from "./auth.validation.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export type AuthResponse = {
  user: AuthUser;
  accessToken: string;
};

export type SignUpResponse = {
  message: string;
};

export type AuthenticatedUser = Pick<AuthUser, "id" | "role">;
