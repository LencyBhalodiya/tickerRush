import type { Request, RequestHandler, Response } from "express";
import * as authService from "./auth.service.js";
import type { AuthResponse, AuthTokens, AuthUser, SignInInput, SignUpInput, SignUpResponse } from "./auth.types.js";

// HttpOnly keeps the refresh token away from page scripts; Path limits it to the auth endpoints.
// Browsers treat http://localhost as secure, so Secure also works in development.
// clearCookie must get the same options, or the browser treats it as a different cookie and keeps this one.
const REFRESH_COOKIE = { httpOnly: true, secure: true, sameSite: "strict", path: "/api/v1/auth" } as const;

export const signUp: RequestHandler<never, SignUpResponse, SignUpInput> = async (req, res) => {
  await authService.signUp(req.body);
  // 202, not 201: the reply is identical whether or not an account was created.
  res.status(202).json({ message: "Sign-up received. Sign in to continue." });
};

export const signIn: RequestHandler<never, AuthResponse, SignInInput> = async (req, res) => {
  const client = clientOf(req);
  const session = await authService.signIn(req.body, client);
  sendSession(res, session);
};

export const refresh: RequestHandler<never, AuthResponse> = async (req, res) => {
  const refreshToken = refreshTokenOf(req);
  const client = clientOf(req);
  const session = await authService.refresh(refreshToken, client);
  sendSession(res, session);
};

// Always 204: logging out with no cookie, or an unknown one, still leaves you logged out.
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(refreshTokenOf(req));
  res.clearCookie("refresh_token", REFRESH_COOKIE);
  res.status(204).end();
};

function sendSession(res: Response<AuthResponse>, { user, tokens }: { user: AuthUser; tokens: AuthTokens }) {
  res.cookie("refresh_token", tokens.refreshToken, { ...REFRESH_COOKIE, expires: tokens.refreshExpiresAt });
  res.set("Cache-Control", "no-store");
  res.status(200).json({ user, accessToken: tokens.accessToken });
}

function clientOf(req: Request) {
  return { userAgent: req.get("user-agent"), ipAddress: req.ip };
}

// cookie-parser turns "j:{...}" values into objects, so check the type before using it.
function refreshTokenOf(req: Request): string | undefined {
  const token: unknown = req.cookies.refresh_token;
  return typeof token === "string" ? token : undefined;
}
