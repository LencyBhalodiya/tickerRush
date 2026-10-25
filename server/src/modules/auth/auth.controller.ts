import type { RequestHandler } from "express";
import { authService } from "./auth.service.js";
import type { RefreshTokenInput, SignInInput, SignUpInput } from "./auth.types.js";

export const signUp: RequestHandler<never, unknown, SignUpInput> = async (req, res) => {
  const result = await authService.signUp(req.body);
  res.status(201).json(result);
};

export const signIn: RequestHandler<never, unknown, SignInInput> = async (req, res) => {
  const result = await authService.signIn(req.body);
  res.status(200).json(result);
};

export const refresh: RequestHandler<never, unknown, RefreshTokenInput> = async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json(tokens);
};
