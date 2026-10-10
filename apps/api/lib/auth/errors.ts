/**
 * One error type for every way authentication can fail.
 *
 * Sign-in failures are raised from three places that answer in two different
 * dialects: the Auth.js `authorize` callbacks (which only understand thrown
 * errors), and the JSON route handlers the mobile app calls (which must answer
 * with the `ApiResponse` envelope). Carrying the `ApiErrorCode` on the thrown
 * error lets both sides agree without the shared logic knowing which caller it
 * is serving.
 *
 * The `message` on one of these is always safe to show a user — see the note on
 * `INVALID_CREDENTIALS_MESSAGE` about what that rules out.
 */
import type { ApiErrorCode } from '@parking/shared';

export class AuthFailure extends Error {
  readonly code: ApiErrorCode;
  /** Field-level detail, keyed the way React Hook Form expects it. */
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { fields?: Record<string, string[]>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AuthFailure';
    this.code = code;
    this.fields = options?.fields;
  }
}

/**
 * The single message for "wrong email" and "wrong password" alike.
 *
 * Distinguishing them turns the sign-in form into an account-enumeration oracle:
 * "no account with that email" tells whoever is asking which addresses are
 * registered. Same reason `verifyPassword` in `password.ts` spends bcrypt time on
 * an account that has no password hash at all.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password.';

/** A disabled account (§22) — worth saying plainly so support gets a useful call. */
export const ACCOUNT_DISABLED_MESSAGE =
  'This account has been disabled. Please contact support.';
