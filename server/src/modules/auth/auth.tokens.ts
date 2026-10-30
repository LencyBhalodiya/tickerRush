import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { USER_ROLES, type AuthTokens, type AuthenticatedUser, type AuthUser, type UserRole } from "./auth.types.js";

const encoder = new TextEncoder();
const accessSecret = encoder.encode(config.JWT_ACCESS_SECRET);
const refreshSecret = encoder.encode(config.JWT_REFRESH_SECRET);

// Absolute session cap: each refresh adds JWT_REFRESH_TOKEN_TTL_DAYS, but never past this many days after sign-in.
const SESSION_MAX_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type TokenKind = "access" | "refresh";

async function signToken(user: AuthUser, kind: TokenKind, expiresAt: string | Date, authTime: Date): Promise<string> {
  const secret = kind === "access" ? accessSecret : refreshSecret;

  // auth_time (the OpenID Connect claim name) is when the user signed in; rotation copies it forward.
  return new SignJWT({ role: user.role, kind, auth_time: Math.floor(authTime.getTime() / 1000) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    // Without a unique id, two sign-ins in the same second produce identical tokens (and tokenHash collides).
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
}

export async function createAuthTokens(user: AuthUser, authTime = new Date()): Promise<AuthTokens> {
  // One Date for the JWT, the DB record and the cookie, so all three expire together.
  const refreshExpiresAt = new Date(
    Math.min(Date.now() + config.JWT_REFRESH_TOKEN_TTL_DAYS * DAY_MS, authTime.getTime() + SESSION_MAX_DAYS * DAY_MS),
  );
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access", config.JWT_ACCESS_TOKEN_TTL, authTime),
    signToken(user, "refresh", refreshExpiresAt, authTime),
  ]);

  return { accessToken, refreshToken, refreshExpiresAt };
}

/**
 * Refresh and reset tokens are high-entropy secrets. A deterministic hash lets
 * us look them up without ever storing the usable token in MongoDB.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyAccessToken(token: string): Promise<AuthenticatedUser> {
  try {
    // Pinning the algorithm rejects tokens re-signed with another HS* variant of the same secret.
    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ["HS256"] });

    if (!payload.sub || payload.kind !== "access" || !USER_ROLES.includes(payload.role as UserRole)) {
      throw new AppError(401, "Invalid access token", "INVALID_ACCESS_TOKEN");
    }

    return { id: payload.sub, role: payload.role as UserRole };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "Invalid or expired access token", "INVALID_ACCESS_TOKEN");
  }
}

export const sessionEnded = () =>
  new AppError(401, "Your session has ended. Please sign in again.", "INVALID_REFRESH_TOKEN");

/** Returns the sign-in time (auth_time) the session started at. */
export async function verifyRefreshToken(token: string): Promise<Date> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ["HS256"] });
    if (payload.kind !== "refresh" || typeof payload.auth_time !== "number") throw sessionEnded();
    return new Date(payload.auth_time * 1000);
  } catch {
    throw sessionEnded();
  }
}
