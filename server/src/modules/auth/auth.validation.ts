import { z } from "zod";

// Normalise before the format check; z.email().trim() would validate the untrimmed value.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(12).max(128);

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
});

// No minimum here, so tightening the signup rule never locks out existing passwords.
export const signInSchema = z.object({ email, password: z.string().min(1).max(128) });

// Real link tokens are 43 characters; the cap only stops huge bodies being hashed.
const linkToken = z.string().min(1).max(128);

export const verifyEmailSchema = z.object({ token: linkToken });

export const resendVerificationSchema = z.object({ email });

export const forgotPasswordSchema = z.object({ email });

// Same password rule as sign-up: a new password must pass what a new account's would.
export const resetPasswordSchema = z.object({ token: linkToken, password });
