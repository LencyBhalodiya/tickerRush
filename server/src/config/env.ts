import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.url(),
  JWT_ACCESS_SECRET: z.string().min(15),
  JWT_REFRESH_SECRET: z.string().min(15),
  JWT_ACCESS_TOKEN_TTL: z.string().min(2).default("15m"),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
});

export type Environment = z.infer<typeof envSchema>;

const env = envSchema.parse(process.env);

export const config = { ...env, isProduction: env.NODE_ENV === "production" };
