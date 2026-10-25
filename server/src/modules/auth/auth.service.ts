import { AppError } from "../../common/errors/app-error.js";
import type { AuthTokens, AuthUser, SignInInput, SignUpInput } from "./auth.types.js";

/**
 * Authentication orchestration belongs here. Persistence and token issuance are
 * deliberately kept out of controllers so they can be tested independently.
 */
export class AuthService {
  async signUp(_input: SignUpInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    throw new AppError(501, "Sign-up has not been implemented yet", "NOT_IMPLEMENTED");
  }

  async signIn(_input: SignInInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    throw new AppError(501, "Sign-in has not been implemented yet", "NOT_IMPLEMENTED");
  }

  async refresh(_refreshToken: string): Promise<AuthTokens> {
    throw new AppError(501, "Token refresh has not been implemented yet", "NOT_IMPLEMENTED");
  }
}

export const authService = new AuthService();
