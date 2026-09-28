/**
 * Auth request/response contracts (context.txt §4 · decisions.md D3).
 *
 * These are the shapes the sign-in screens post and the route handlers under
 * `apps/api/app/api/auth/**` validate — one definition each, so a form and the
 * endpoint it posts to cannot disagree about a field name or a rule.
 *
 * The one thing to notice is what is NOT here: there is no `role` on any request
 * schema. A client cannot ask to be an admin (context.txt §110-112); `role`
 * appears only on the *response*, where it came out of the database.
 */
import { z } from 'zod';

import { UserRoleSchema } from './enums';
import {
  EmailSchema,
  OptionalIndianPhoneSchema,
  PasswordSchema,
} from './schemas';

/* ───────────────────────────── Requests ────────────────────────────── */

/** `POST /api/auth/register` — email/password sign-up. */
export const RegisterRequestSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: EmailSchema,
  /** Optional at sign-up; the receipt needs it eventually (§17), Phase 03 chases it. */
  phone: OptionalIndianPhoneSchema,
  password: PasswordSchema,
});
export type RegisterRequest = z.input<typeof RegisterRequestSchema>;
export type RegisterRequestParsed = z.output<typeof RegisterRequestSchema>;

/** `POST /api/auth/login` — email/password sign-in. */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  /**
   * Deliberately NOT `PasswordSchema`. Applying the sign-up rules at sign-in
   * would tell an attacker "that password is too short to be ours", and would
   * lock out an existing account if the policy ever tightened.
   */
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;
export type LoginRequestParsed = z.output<typeof LoginRequestSchema>;

/**
 * `POST /api/auth/google` — the Google ID token the app obtained natively.
 *
 * D3: the app does the Google dance itself and hands the backend the resulting
 * ID token, which the backend verifies with `google-auth-library` before it
 * trusts a single claim in it.
 */
export const GoogleSignInRequestSchema = z.object({
  idToken: z.string().min(1, 'Google did not return an ID token'),
});
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequestSchema>;

/* ───────────────────────────── Responses ───────────────────────────── */

/**
 * The authenticated user as every client sees it. `role` is authoritative-as-of
 * sign-in and drives which navigation stack the app opens (context.txt §19); the
 * backend re-checks it from the database on every privileged request regardless
 * (see `apps/api/lib/auth/guard.ts`).
 */
export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  imageUrl: z.string().nullable(),
  role: UserRoleSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/**
 * What `register` / `login` / `google` all answer with: the session JWT plus the
 * user it belongs to.
 *
 * The app stores `token` in `expo-secure-store` (never AsyncStorage — D3) and
 * sends it as `Authorization: Bearer <token>`.
 */
export const AuthSessionSchema = z.object({
  token: z.string(),
  /** ISO 8601. The app re-authenticates rather than sending a token it knows is stale. */
  expiresAt: z.string(),
  user: SessionUserSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

/** `GET /api/auth/me` — used at app start to check a stored token is still good. */
export const MeResponseSchema = z.object({
  user: SessionUserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
