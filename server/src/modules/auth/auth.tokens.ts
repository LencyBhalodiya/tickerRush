import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { USER_ROLES, type AuthTokens, type AuthenticatedUser, type AuthUser, type UserRole } from "./auth.types.js";

const encoder = new TextEncoder();
const accessSecret = encoder.encode(config.jwt.accessSecret);
const refreshSecret = encoder.encode(config.jwt.refreshSecret);

type TokenKind = "access" | "refresh";

async function signToken(user: AuthUser, kind: TokenKind): Promise<string> {
  const secret = kind === "access" ? accessSecret : refreshSecret;
  const expiration = kind === "access" ? config.jwt.accessTokenTtl : `${config.jwt.refreshTokenTtlDays}d`;

  return new SignJWT({ role: user.role, kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(secret);
}

export async function createAuthTokens(user: AuthUser): Promise<AuthTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access"),
    signToken(user, "refresh"),
  ]);

  return { accessToken, refreshToken };
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
    const { payload } = await jwtVerify(token, accessSecret);

    if (!payload.sub || payload.kind !== "access" || !USER_ROLES.includes(payload.role as UserRole)) {
      throw new AppError(401, "Invalid access token", "INVALID_ACCESS_TOKEN");
    }

    return { id: payload.sub, role: payload.role as UserRole };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "Invalid or expired access token", "INVALID_ACCESS_TOKEN");
  }
}
