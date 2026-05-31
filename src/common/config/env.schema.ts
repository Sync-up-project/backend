import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().optional(),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z
      .string()
      .min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().optional(),
    JWT_REFRESH_EXPIRES_IN: z.string().optional(),
    FRONTEND_URL: z.string().url().optional(),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
    LOG_LEVEL: z.enum(['log', 'warn', 'error', 'debug', 'verbose']).optional(),
    SWAGGER: z.enum(['true', 'false']).optional(),
    OPENAI_API_KEY: z.string().optional(),
    CHAT_TRANSLATION_ENABLED: z.string().optional(),
    CHAT_TRANSLATION_MAX_CHARS: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITHUB_CALLBACK_URL: z.string().url().optional(),
  })
  .refine(
    (env) => {
      if (env.COOKIE_SAMESITE !== 'none') return true;
      return env.COOKIE_SECURE === 'true';
    },
    { message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true' },
  )
  .refine(
    (env) => {
      if (env.NODE_ENV !== 'production') return true;
      return Boolean(env.FRONTEND_URL);
    },
    { message: 'FRONTEND_URL is required in production' },
  );

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${msg}`);
  }
  return parsed.data;
}
