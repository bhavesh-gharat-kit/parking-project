/**
 * Validated server environment.
 *
 * Reading `process.env.X` inline lets a missing variable surface as
 * `undefined` three layers deep at request time. Parsing once here means a
 * misconfigured VPS fails at boot with a readable message instead.
 *
 * Variables are declared optional until the phase that starts using them
 * promotes them to required (see `.env.example` for what each one is). Phase 02
 * promoted `AUTH_SECRET` and `AUTH_URL`.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy apps/api/.env.example to .env'),

  // ── Phase 02 (auth, decisions.md D3) ──

  /**
   * Derives the encryption key for every session JWT. Required: without it
   * Auth.js cannot mint or read a token, so a missing value is a dead API
   * rather than a degraded one. 32 bytes is what `openssl rand -base64 32`
   * gives and what Auth.js documents.
   */
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters — generate one with `openssl rand -base64 32`'),

  /**
   * Public origin of this API. Its scheme decides the session cookie name, and
   * therefore the HKDF salt of the session JWT — see `lib/auth/session.ts`.
   */
  AUTH_URL: z.string().url().default('http://localhost:3000'),

  AUTH_SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * Valid *audiences* for a Google ID token this backend verifies. Left optional
   * because email/password sign-in works without them: with neither set, the
   * Google endpoint answers SERVICE_UNAVAILABLE with an explanation instead of
   * the whole API refusing to boot.
   */
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),

  /** Only the Phase 2 website's browser OAuth redirect needs this. */
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
