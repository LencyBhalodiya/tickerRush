import { z } from "zod";

const email = z.email().trim().toLowerCase();
const password = z.string().min(12).max(128);

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
});

export const signInSchema = z.object({ email, password });

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
