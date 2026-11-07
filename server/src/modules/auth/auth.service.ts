import argon2 from "argon2";
import type { HydratedDocument } from "mongoose";
import { AppError } from "../../common/errors/app-error.js";
import { config } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendEmail } from "../../config/mailer.js";
import { AuthTokenModel, type AuthToken, type AuthTokenType } from "./auth-token.model.js";
import { AuthAccountModel, type AuthAccount } from "./auth.model.js";
import { createAuthTokens, createLinkToken, hashToken, sessionEnded, verifyRefreshToken } from "./auth.tokens.js";
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

type LinkType = Exclude<AuthTokenType, "refresh">;

// Where each kind of emailed link lands on the front-end, and how long it works.
// Reset links are short-lived: one in the wrong hands takes over the account.
const LINKS: Record<LinkType, { path: string; ttlMs: number }> = {
  email_verification: { path: "/verify-email", ttlMs: 24 * 60 * 60 * 1000 },
  password_reset: { path: "/reset-password", ttlMs: 60 * 60 * 1000 },
};

type Client = Pick<AuthToken, "userAgent" | "ipAddress">;
type Session = { user: AuthUser; tokens: AuthTokens };

// A taken email ends exactly like a new one: same reply, and the same work (one hash, one insert),
// so neither the response nor its timing confirms which emails are registered.
// No exists() pre-check: it would make taken emails return faster. The unique index decides.
export async function signUp(input: SignUpInput): Promise<void> {
  const passwordHash = await argon2.hash(input.password, HASH_OPTIONS);

  try {
    const account = await AuthAccountModel.create({ name: input.name, email: input.email, passwordHash });
    logger.info({ event: "signup_succeeded", userId: account.id, role: account.role }, "User account created");

    sendVerificationEmail(account);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    logger.warn({ event: "signup_email_taken" }, "Sign-up for an existing email ignored");

    // Tell the real owner, with a way in: if someone else registered this email first, a password reset makes the
    // account theirs. Never a verification link here: it would verify whoever registered this email first.
    sendEmail({
      to: input.email,
      subject: "Someone tried to sign up with your email",
      text: [
        "Someone just tried to create a tickerRush account with this email address.",
        "",
        "If it was you: you already have an account, so sign in instead.",
        `Forgot your password, or can't sign in? Reset it here: ${new URL("/forgot-password", config.CORS_ORIGIN).href}`,
        "",
        "If it wasn't you: your account is safe and nothing has changed. You can ignore this email.",
      ].join("\n"),
    });
  }
}

// The name is left out on purpose: anyone can sign up with someone else's address and put a phishing line in the name.
function sendVerificationEmail(account: HydratedDocument<AuthAccount>): void {
  emailLink(account, "email_verification", (link) => ({
    subject: "Confirm your email for tickerRush",
    text: [
      "Confirm your email address to finish signing up:",
      link,
      "",
      "The link works once and expires in 24 hours. If you didn't sign up, ignore this email.",
    ].join("\n"),
  }));
}

function sendPasswordResetEmail(account: HydratedDocument<AuthAccount>): void {
  emailLink(account, "password_reset", (link) => ({
    subject: "Reset your tickerRush password",
    text: [
      "Someone asked to reset the password for this email address. Choose a new password here:",
      link,
      "",
      "The link works once and expires in 1 hour. If you didn't ask, ignore this email: your password hasn't changed.",
    ].join("\n"),
  }));
}

// Returns at once, like sendEmail: the token insert runs after the reply, so callers answer in the same time
// whether or not they send one. The catch is required: an unhandled rejection shuts the whole server down (server.ts).
function emailLink(
  account: HydratedDocument<AuthAccount>,
  type: LinkType,
  compose: (link: string) => { subject: string; text: string },
): void {
  createLink(account, type).then(
    (link) => sendEmail({ to: account.email, ...compose(link.href) }),
    (error: unknown) => {
      logger.error({ event: "link_email_failed", type, userId: account.id, err: error }, "Link email failed");
    },
  );
}

async function createLink(account: HydratedDocument<AuthAccount>, type: LinkType): Promise<URL> {
  // Only the newest link of each kind works: a new one makes the earlier ones useless.
  await AuthTokenModel.deleteMany({ userId: account._id, type });
  const token = createLinkToken();
  await AuthTokenModel.create({
    tokenHash: hashToken(token),
    userId: account._id,
    type,
    expiresAt: new Date(Date.now() + LINKS[type].ttlMs),
  });

  // CORS_ORIGIN is the front-end's address. The link opens a page there, which POSTs the token back to the API.
  const link = new URL(LINKS[type].path, config.CORS_ORIGIN);
  link.searchParams.set("token", token);
  return link;
}

// Atomic, like the refresh claim: of two clicks on the same link, only one gets the record.
function claimLink(token: string, type: LinkType) {
  return AuthTokenModel.findOneAndDelete({ tokenHash: hashToken(token), type, expiresAt: { $gt: new Date() } });
}

// The same reply and the same awaited work (one lookup) for an unknown, verified or unverified email,
// so this never reveals which emails are registered.
export async function resendVerification(email: string): Promise<void> {
  const account = await AuthAccountModel.findOne({ email });
  if (!account || account.emailVerifiedAt) return;
  sendVerificationEmail(account);
  logger.info({ event: "verification_resent", userId: account.id }, "Verification email resent");
}

// Same idea as resend: one lookup, then the email goes out after the reply, so every email gets the same reply
// in the same time.
export async function forgotPassword(email: string): Promise<void> {
  const account = await AuthAccountModel.findOne({ email });
  if (!account) return;
  sendPasswordResetEmail(account);
  logger.info({ event: "password_reset_requested", userId: account.id }, "Password reset requested");
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
