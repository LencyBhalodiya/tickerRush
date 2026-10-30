import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { USER_ROLES, type AuthTokens, type AuthenticatedUser, type AuthUser, type UserRole } from "./auth.types.js";

const encoder = new TextEncoder();
const accessSecret = encoder.encode(config.JWT_ACCESS_SECRET);
const refreshSecret = encoder.encode(config.JWT_REFRESH_SECRET);

type TokenKind = "access" | "refresh";

async function signToken(user: AuthUser, kind: TokenKind, expiresAt: string | Date): Promise<string> {
  const secret = kind === "access" ? accessSecret : refreshSecret;

  return new SignJWT({ role: user.role, kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    // Without a unique id, two sign-ins in the same second produce identical tokens (and tokenHash collides).
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
}

export async function createAuthTokens(user: AuthUser): Promise<AuthTokens> {
  // One Date for the JWT, the DB record and the cookie, so all three expire together.
  const refreshExpiresAt = new Date(Date.now() + config.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access", config.JWT_ACCESS_TOKEN_TTL),
    signToken(user, "refresh", refreshExpiresAt),
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
