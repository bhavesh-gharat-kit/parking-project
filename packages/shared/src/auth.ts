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
  OtpCodeSchema,
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

/**
 * `POST /api/profile/change-password` — a signed-in user changing their own
 * password (Phase 14).
 *
 * Note what is absent, for the same reason `role` is absent above: there is no
 * target user. The endpoint changes the password of whichever account the Bearer
 * token resolves to, so there is no field here that could aim it at someone else.
 *
 * `currentPassword` is required even though the caller already holds a valid
 * session. D3 sessions are stateless JWTs that live up to 30 days, so a token
 * that leaked off a lost phone is a password change away from being a permanent
 * account takeover — unless the thief also has to know the password.
 */
const ChangePasswordBaseSchema = z.object({
  /**
   * Deliberately NOT `PasswordSchema`, exactly as in `LoginRequestSchema`: this is
   * an existing password being checked, not a new one being chosen. Validating it
   * against today's rules would reject an older, shorter-but-correct password
   * before bcrypt ever saw it, and would tell the caller what our rules are.
   */
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  /** The same rules the account was registered under (`RegisterRequestSchema`). */
  newPassword: PasswordSchema,
});

const NEW_PASSWORD_MUST_DIFFER = 'Choose a new password different from your current one';

/** A re-type of the same string cannot be what "changed" means. */
const newPasswordDiffers = (value: { currentPassword: string; newPassword: string }) =>
  value.newPassword !== value.currentPassword;

export const ChangePasswordRequestSchema = ChangePasswordBaseSchema.refine(newPasswordDiffers, {
  path: ['newPassword'],
  message: NEW_PASSWORD_MUST_DIFFER,
});
export type ChangePasswordRequest = z.input<typeof ChangePasswordRequestSchema>;
export type ChangePasswordRequestParsed = z.output<typeof ChangePasswordRequestSchema>;

/**
 * What the RN form validates — the wire contract plus one field that never
 * leaves the device.
 *
 * `confirmNewPassword` is a typo check, not a rule the server can enforce: by the
 * time a request arrives there is only one new password in it, and a server that
 * demanded the same string twice would be asking the client to prove something it
 * already decided. So it is derived from `ChangePasswordBaseSchema` rather than
 * added to the request schema, and the screen posts only the two fields above.
 */
export const ChangePasswordFormSchema = ChangePasswordBaseSchema.extend({
  confirmNewPassword: z.string().min(1, 'Re-enter your new password'),
})
  .refine(newPasswordDiffers, { path: ['newPassword'], message: NEW_PASSWORD_MUST_DIFFER })
  .refine((value) => value.confirmNewPassword === value.newPassword, {
    path: ['confirmNewPassword'],
    message: 'The two passwords do not match',
  });
export type ChangePasswordForm = z.input<typeof ChangePasswordFormSchema>;
export type ChangePasswordFormParsed = z.output<typeof ChangePasswordFormSchema>;

/* ──────────────────── Forgot password / OTP reset ──────────────────── */

/**
 * How long the server makes a customer wait before it will send a second code
 * to the same address (`apps/api/lib/auth/password-reset.ts`).
 *
 * Shared rather than duplicated because the RN screen counts the same window
 * down on its "Resend code" button. A client timer that disagreed with the
 * server would either offer a resend that silently does nothing — the server
 * answers the same generic success either way, so the customer would be told a
 * code is on its way when none was sent — or keep the button disabled after the
 * server was ready again.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * `POST /api/auth/forgot-password/request-otp` — step one: an email address, and
 * nothing else.
 *
 * There is no "and here is who I am" field, and none is possible: the endpoint's
 * whole job is to decide for itself whether this address has a resettable
 * account, and to answer the same way whatever it decides.
 */
export const ForgotPasswordRequestOtpRequestSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordRequestOtpRequest = z.input<
  typeof ForgotPasswordRequestOtpRequestSchema
>;
export type ForgotPasswordRequestOtpRequestParsed = z.output<
  typeof ForgotPasswordRequestOtpRequestSchema
>;

/**
 * The one response `request-otp` ever gives.
 *
 * `requested: true` and nothing more, on purpose — not `{ sent: boolean }`, not
 * an expiry, not a masked address. A registered email, an unregistered one, a
 * Google-only account and a resend inside the cooldown all produce this exact
 * body with this exact status, because any field that varied between them would
 * tell an anonymous caller which addresses have accounts. Read it as "we have
 * taken your request", never as "an email is on its way".
 */
export const ForgotPasswordRequestOtpResponseSchema = z.object({
  requested: z.literal(true),
});
export type ForgotPasswordRequestOtpResponse = z.infer<
  typeof ForgotPasswordRequestOtpResponseSchema
>;

/**
 * `POST /api/auth/forgot-password/verify-otp` — step two: the code from the
 * email, plus the password to set.
 *
 * One call rather than "verify, then reset with a ticket the verify handed back".
 * A second round trip would need its own short-lived credential to carry proof of
 * the code between the two calls — a second thing to issue, store, expire and get
 * wrong — and the customer has already typed both fields into one form by then.
 *
 * `email` is here as well as in step one because the OTP is per address and this
 * request stands alone; there is no session or cookie tying it to the request that
 * sent the code.
 */
export const ForgotPasswordVerifyOtpRequestSchema = z.object({
  email: EmailSchema,
  otp: OtpCodeSchema,
  /** The same rules a sign-up is held to (`RegisterRequestSchema`). */
  newPassword: PasswordSchema,
});
export type ForgotPasswordVerifyOtpRequest = z.input<
  typeof ForgotPasswordVerifyOtpRequestSchema
>;
export type ForgotPasswordVerifyOtpRequestParsed = z.output<
  typeof ForgotPasswordVerifyOtpRequestSchema
>;

/**
 * Nothing to return but "it worked" — specifically *not* an `AuthSession`.
 *
 * Signing the customer in off the back of a reset would be convenient and wrong:
 * the strongest thing proven here is control of the mailbox, and D3 sessions are
 * 30-day bearer tokens with no server-side revocation. Someone with a stolen
 * mailbox would walk away holding a month-long session. They get sent to the
 * sign-in screen to type the password they just chose instead.
 */
export const ForgotPasswordVerifyOtpResponseSchema = z.object({
  reset: z.literal(true),
});
export type ForgotPasswordVerifyOtpResponse = z.infer<
  typeof ForgotPasswordVerifyOtpResponseSchema
>;

/**
 * What the RN reset form validates — step two's wire contract minus `email`,
 * plus one field that never leaves the device.
 *
 * `email` is absent because the screen already holds it in local state from step
 * one (the same two-steps-in-one-screen shape as
 * `customer/bookings/[id]/upi.tsx`), so re-rendering it as an editable input
 * would invite a customer to change it and wonder why their code stopped working.
 *
 * `confirmNewPassword` is a typo check, not a rule a server can enforce, exactly
 * as in `ChangePasswordFormSchema` — only `newPassword` is posted.
 */
export const ForgotPasswordResetFormSchema = z
  .object({
    otp: OtpCodeSchema,
    newPassword: PasswordSchema,
    confirmNewPassword: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((value) => value.confirmNewPassword === value.newPassword, {
    path: ['confirmNewPassword'],
    message: 'The two passwords do not match',
  });
export type ForgotPasswordResetForm = z.input<typeof ForgotPasswordResetFormSchema>;
export type ForgotPasswordResetFormParsed = z.output<typeof ForgotPasswordResetFormSchema>;

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
