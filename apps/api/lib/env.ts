/**
 * Validated server environment.
 *
 * Reading `process.env.X` inline lets a missing variable surface as
 * `undefined` three layers deep at request time. Parsing once here means a
 * misconfigured VPS fails at boot with a readable message instead.
 *
 * Phase 01 only requires `DATABASE_URL` — the auth and push variables are
 * declared as optional and get promoted to required by the phase that starts
 * using them (see `.env.example` for what each one is).
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy apps/api/.env.example to .env'),

  // ── Phase 02 (auth) ──
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),
  AUTH_SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ── Phase 05 (booking expiry, context.txt §15) ──
  BOOKING_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),
  CRON_SECRET: z.string().optional(),

  // ── Phase 09 (Expo push, decisions.md D4) ──
  EXPO_ACCESS_TOKEN: z.string().optional(),

  ALLOWED_WEB_ORIGINS: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid server environment:\n${detail}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
