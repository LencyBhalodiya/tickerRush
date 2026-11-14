import argon2 from "argon2";
import type { HydratedDocument } from "mongoose";
import { AppError } from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import { AuthTokenModel, type AuthToken } from "./auth-token.model.js";
import { queueEmail, type LinkType } from "./auth.emails.js";
import { AuthAccountModel, type AuthAccount } from "./auth.model.js";
import { createAuthTokens, hashToken, sessionEnded, verifyRefreshToken } from "./auth.tokens.js";
import type { AuthTokens, AuthUser, ResetPasswordInput, SignInInput, SignUpInput } from "./auth.types.js";

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Verified when the email is unknown, so that path costs the same as a wrong password.
const dummyHash = argon2.hash("timing-equaliser", HASH_OPTIONS);

// Two tabs (or a retry after a lost response) can send the same refresh token at once. Within this window
// the second one also gets a fresh pair instead of setting off reuse detection.
const ROTATION_GRACE_MS = 10_000;

type Client = Pick<AuthToken, "userAgent" | "ipAddress">;
type Session = { user: AuthUser; tokens: AuthTokens };

// A taken email ends exactly like a new one: same reply, and the same work (one hash, one insert, one queued
// email), so neither the response nor its timing confirms which emails are registered.
// No exists() pre-check: it would make taken emails return faster. The unique index decides.
export async function signUp(input: SignUpInput): Promise<void> {
  const passwordHash = await argon2.hash(input.password, HASH_OPTIONS);
  let kind: "verification" | "signup_taken" = "verification";
  let account: HydratedDocument<AuthAccount> | undefined;

  try {
    account = await AuthAccountModel.create({ name: input.name, email: input.email, passwordHash });
    logger.info({ event: "signup_succeeded", userId: account.id, role: account.role }, "User account created");
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    logger.warn({ event: "signup_email_taken" }, "Sign-up for an existing email ignored");
    // The owner hears that someone tried. A verification link here would verify whoever registered first.
    kind = "signup_taken";
  }

  try {
    await queueEmail({ kind, email: input.email });
  } catch (error) {
    // No verification email can go out, so undo the sign-up: "try again" then really starts over, instead of
    // finding the email taken. If the job reached Redis after all, the worker finds no account and sends nothing.
    if (account) {
      await account.deleteOne();
      logger.warn({ event: "signup_undone", userId: account.id }, "Account removed: its email could not be queued");
    }
    throw error;
  }
}

// Atomic, like the refresh claim: of two clicks on the same link, only one gets the record.
function claimLink(token: string, type: LinkType) {
  return AuthTokenModel.findOneAndDelete({ tokenHash: hashToken(token), type, expiresAt: { $gt: new Date() } });
}

// No lookup here: every email gets the same reply after the same work (one queued job), so this never reveals
// which emails are registered. The worker sends a link only to an existing, unverified account.
export async function resendVerification(email: string): Promise<void> {
  await queueEmail({ kind: "verification", email });
}

// Same idea as resend: the worker sends a reset link only if the email is registered.
export async function forgotPassword(email: string): Promise<void> {
  await queueEmail({ kind: "password_reset", email });
}

export async function signIn(input: SignInInput, client: Client): Promise<Session> {
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

  // Checked only after the password matches, so it can't reveal whether an email is registered.
  if (!account.emailVerifiedAt) {
    logger.warn({ event: "signin_unverified", userId: account.id }, "Sign-in refused: email not verified");
    throw new AppError(403, "Confirm your email before signing in.", "EMAIL_NOT_VERIFIED");
  }

  const session = await issueTokens(account, client);
  logger.info({ event: "signin_succeeded", userId: account.id }, "User signed in");
  return session;
}

export async function verifyEmail(token: string): Promise<void> {
  const record = await claimLink(token, "email_verification");
  if (!record) {
    throw new AppError(400, "This link has expired or was already used.", "INVALID_VERIFICATION_TOKEN");
  }

  // Only when still unverified, so a second link (after a resend) can't move the original date.
  await AuthAccountModel.updateOne({ _id: record.userId, emailVerifiedAt: null }, { emailVerifiedAt: new Date() });
  logger.info({ event: "email_verified", userId: String(record.userId) }, "Email verified");
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await claimLink(input.token, "password_reset");
  const account = record ? await AuthAccountModel.findById(record.userId) : null;
  if (!account) {
    throw new AppError(400, "This link has expired or was already used.", "INVALID_RESET_TOKEN");
  }

  account.passwordHash = await argon2.hash(input.password, HASH_OPTIONS);
  // The link reached this inbox, which proves the address just as a verification link does.
  account.emailVerifiedAt ??= new Date();
  await account.save();

  // End every session: whoever knew the old password, or registered this email first, is signed out.
  // Their access token still works until it expires (15 minutes at most).
  await AuthTokenModel.deleteMany({ userId: account._id, type: "refresh" });
  logger.info({ event: "password_reset", userId: account.id }, "Password reset");
}

// Records are only ever *revoked* by rotation; logout and reuse detection delete them.
// So a revoked record means "already swapped for a newer token", and seeing it again means a copy is in use.
export async function refresh(refreshToken: string | undefined, client: Client): Promise<Session> {
  if (!refreshToken) throw sessionEnded();
  const authTime = await verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  // Atomic: of two requests carrying the same token, only one can flip revokedAt from null.
  // expiresAt is checked here too because the TTL monitor deletes expired records up to a minute late.
  let record = await AuthTokenModel.findOneAndUpdate(
    { tokenHash, type: "refresh", revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now },
  );

  if (!record) {
    const rotated = await AuthTokenModel.findOne({ tokenHash, type: "refresh" });
    if (!rotated?.revokedAt) throw sessionEnded();

    if (now.getTime() - rotated.revokedAt.getTime() > ROTATION_GRACE_MS) {
      await AuthTokenModel.deleteMany({ userId: rotated.userId, type: "refresh" });
      logger.warn({ event: "refresh_token_reused", userId: String(rotated.userId) }, "Rotated refresh token reused");
      throw sessionEnded();
    }
    record = rotated;
  }

  // Read the account fresh, so a deleted account or a changed role takes effect now.
  const account = await AuthAccountModel.findById(record.userId);
  if (!account) throw sessionEnded();

  return issueTokens(account, client, authTime);
}

// Delete, don't revoke: a logged-out token is then simply unknown (see refresh). revokedAt: null leaves an
// already-rotated record in place, so replaying it still sets off reuse detection.
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const record = await AuthTokenModel.findOneAndDelete({
    tokenHash: hashToken(refreshToken),
    type: "refresh",
    revokedAt: null,
  });
  if (record) logger.info({ event: "logout_succeeded", userId: String(record.userId) }, "User logged out");
}

async function issueTokens(
  account: HydratedDocument<AuthAccount>,
  client: Client,
  authTime?: Date,
): Promise<Session> {
  const user: AuthUser = { id: account.id, name: account.name, email: account.email, role: account.role };
  const tokens = await createAuthTokens(user, authTime);

  await AuthTokenModel.create({
    tokenHash: hashToken(tokens.refreshToken),
    userId: account._id,
    type: "refresh",
    expiresAt: tokens.refreshExpiresAt,
    userAgent: client.userAgent?.slice(0, 512),
    ipAddress: client.ipAddress,
  });

  return { user, tokens };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}
