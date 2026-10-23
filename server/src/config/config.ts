import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Environment = z.infer<typeof envSchema>;

const env: Environment = envSchema.parse(process.env);

export const config = {
  port: env.PORT,
};
