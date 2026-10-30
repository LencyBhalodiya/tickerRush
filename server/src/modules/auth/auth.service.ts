import argon2 from "argon2";
import { AppError } from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import { AuthTokenModel, type AuthToken } from "./auth-token.model.js";
import { AuthAccountModel } from "./auth.model.js";
import { createAuthTokens, hashToken } from "./auth.tokens.js";
import type { AuthTokens, AuthUser, SignInInput, SignUpInput } from "./auth.types.js";

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Verified when the email is unknown, so that path costs the same as a wrong password.
const dummyHash = argon2.hash("timing-equaliser", HASH_OPTIONS);

export async function signUp(input: SignUpInput): Promise<void> {
  const emailInUse = await AuthAccountModel.exists({ email: input.email });
  if (emailInUse) {
    throw new AppError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await argon2.hash(input.password, HASH_OPTIONS);

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

export async function signIn(
  input: SignInInput,
  client: Pick<AuthToken, "userAgent" | "ipAddress">,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const account = await AuthAccountModel.findOne({ email: input.email }).select("+passwordHash");
  const passwordMatches = await argon2.verify(account?.passwordHash ?? (await dummyHash), input.password);

  // One response for both failures, so sign-in never confirms which emails are registered.
  if (!account || !passwordMatches) {
    logger.warn(
      { event: "signin_failed", reason: account ? "wrong_password" : "unknown_email", userId: account?.id },
      "Sign-in failed",
    );
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const user: AuthUser = { id: account.id, name: account.name, email: account.email, role: account.role };
  const tokens = await createAuthTokens(user);

  await AuthTokenModel.create({
    tokenHash: hashToken(tokens.refreshToken),
    userId: account._id,
    type: "refresh",
    expiresAt: tokens.refreshExpiresAt,
    userAgent: client.userAgent?.slice(0, 512),
    ipAddress: client.ipAddress,
  });

  logger.info({ event: "signin_succeeded", userId: user.id }, "User signed in");
  return { user, tokens };
}

export async function refresh(_refreshToken: string): Promise<AuthTokens> {
  throw new AppError(501, "Token refresh has not been implemented yet", "NOT_IMPLEMENTED");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}
