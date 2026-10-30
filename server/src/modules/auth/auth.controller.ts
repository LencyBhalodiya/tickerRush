import type { RequestHandler } from "express";
import * as authService from "./auth.service.js";
import type { AuthResponse, RefreshTokenInput, SignInInput, SignUpInput, SignUpResponse } from "./auth.types.js";

export const signUp: RequestHandler<never, SignUpResponse, SignUpInput> = async (req, res) => {
  await authService.signUp(req.body);
  res.status(201).json({ message: "Account created successfully" });
};

export const signIn: RequestHandler<never, AuthResponse, SignInInput> = async (req, res) => {
  const { user, tokens } = await authService.signIn(req.body, {
    userAgent: req.get("user-agent"),
    ipAddress: req.ip,
  });

  // HttpOnly keeps the refresh token away from page scripts; Path limits it to the auth endpoints.
  // Browsers treat http://localhost as secure, so Secure also works in development.
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/v1/auth",
    expires: tokens.refreshExpiresAt,
  });
  res.set("Cache-Control", "no-store");
  res.status(200).json({ user, accessToken: tokens.accessToken });
};

export const refresh: RequestHandler<never, unknown, RefreshTokenInput> = async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json(tokens);
};
