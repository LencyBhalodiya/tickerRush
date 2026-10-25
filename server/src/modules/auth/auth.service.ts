import argon2 from "argon2";
import { AppError } from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import { AuthAccountModel } from "./auth.model.js";
import type { AuthTokens, AuthUser, SignInInput, SignUpInput } from "./auth.types.js";

export async function signUp(input: SignUpInput): Promise<void> {
  const emailInUse = await AuthAccountModel.exists({ email: input.email });
  if (emailInUse) {
    throw new AppError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const account = new AuthAccountModel({
    name: input.name,
    email: input.email,
    passwordHash,
  });

  try {
    await account.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
    }
    throw error;
  }

  logger.info({ event: "signup_succeeded", userId: account.id, role: account.role }, "User account created");
}

export async function signIn(_input: SignInInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  throw new AppError(501, "Sign-in has not been implemented yet", "NOT_IMPLEMENTED");
}

export async function refresh(_refreshToken: string): Promise<AuthTokens> {
  throw new AppError(501, "Token refresh has not been implemented yet", "NOT_IMPLEMENTED");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}
