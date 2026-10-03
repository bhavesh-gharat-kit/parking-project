/**
 * One-time code generation, and the three numbers that make a 6-digit secret
 * safe enough to reset a password with (Phase 15).
 *
 * ── There is no `hashOtp` here ──────────────────────────────────────────────
 *
 * On purpose. A code is hashed with `hashPassword` and checked with
 * `verifyPassword` from `./password.ts`, the same two functions the account's own
 * password goes through. A second hashing helper in this codebase — even a
 * thin one wrapping the same bcrypt — is a second place for a cost factor to
 * drift, and the reason `password.ts` picked `bcryptjs` over native bcrypt (no
 * node-gyp on the VPS) applies here unchanged.
 *
 * ── Why 6 digits is defensible at all ──────────────────────────────────────
 *
 * A million possibilities is nothing against unlimited guessing: at even a
 * modest request rate, 10 minutes is enough to walk a meaningful share of the
 * space. What makes it safe is not the length but the three constants below
 * working together — a short life, a hard attempt ceiling per code, and a
 * cooldown that stops an attacker from minting fresh codes to reset that
 * ceiling. Change any one of them and the other two stop being enough.
 *
 * `crypto.randomInt`, not `Math.random`: the latter is a seeded PRNG whose
 * output is predictable from previous draws, which for a credential is the whole
 * ballgame.
 */
import { randomInt } from 'node:crypto';

/** Digits in a code. `OtpCodeSchema` in `@parking/shared` validates the same shape. */
export const OTP_LENGTH = 6;

/**
 * Minutes a code stays valid.
 *
 * Long enough to switch apps, find the mail, maybe wait out a slow delivery;
 * short enough that a code sitting in a mailbox someone else later reads is
 * almost always already dead.
 */
export const OTP_TTL_MINUTES = 10;

/**
 * Wrong guesses one code tolerates before it is locked and a new one must be
 * requested.
 *
 * Five is generous for someone copying six digits out of an email and tight
 * against someone guessing: it caps a single code's exposure at 5 in 1,000,000,
 * and combined with the 60-second resend cooldown it caps the *flow* at roughly
 * five guesses a minute no matter how the attacker drives it.
 */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * A fresh code, zero-padded so every code is exactly `OTP_LENGTH` digits.
 *
 * The padding matters beyond looks: without it "042195" would be generated and
 * then emailed as "42195", and a customer typing what they were sent would fail
 * a 6-digit check they had no way to satisfy.
 */
export function generateOtp(): string {
  const ceiling = 10 ** OTP_LENGTH;
  return String(randomInt(0, ceiling)).padStart(OTP_LENGTH, '0');
}

/** When a code generated now stops being accepted. */
export function otpExpiry(minutes: number = OTP_TTL_MINUTES): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
