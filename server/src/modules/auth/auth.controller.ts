import type { Request, RequestHandler, Response } from "express";
import * as authService from "./auth.service.js";
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  ForgotPasswordInput,
  MessageResponse,
  ResendVerificationInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  VerifyEmailInput,
} from "./auth.types.js";

// HttpOnly keeps the refresh token away from page scripts; Path limits it to the auth endpoints.
// Browsers treat http://localhost as secure, so Secure also works in development.
// clearCookie must get the same options, or the browser treats it as a different cookie and keeps this one.
const REFRESH_COOKIE = { httpOnly: true, secure: true, sameSite: "strict", path: "/api/v1/auth" } as const;

export const signUp: RequestHandler<never, MessageResponse, SignUpInput> = async (req, res) => {
  await authService.signUp(req.body);
  // 202, not 201: the reply is identical whether or not an account was created.
  res.status(202).json({ message: "Check your inbox for a link to confirm your email, then sign in." });
};

export const verifyEmail: RequestHandler<never, MessageResponse, VerifyEmailInput> = async (req, res) => {
  await authService.verifyEmail(req.body.token);
  res.status(200).json({ message: "Email confirmed. You can sign in now." });
};

// 202 whatever the email: the reply never shows whether it's registered or already verified.
export const resendVerification: RequestHandler<never, MessageResponse, ResendVerificationInput> = async (req, res) => {
  await authService.resendVerification(req.body.email);
  res.status(202).json({ message: "If that email still needs confirming, a new link is on its way." });
};

// 202 whatever the email: the reply never shows whether it's registered.
export const forgotPassword: RequestHandler<never, MessageResponse, ForgotPasswordInput> = async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.status(202).json({ message: "If that email is registered, a reset link is on its way." });
};

export const resetPassword: RequestHandler<never, MessageResponse, ResetPasswordInput> = async (req, res) => {
  await authService.resetPassword(req.body);
  res.status(200).json({ message: "Password changed. Sign in with your new password." });
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
