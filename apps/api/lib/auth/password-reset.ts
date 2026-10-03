/**
 * Forgot-password: issuing and spending a one-time reset code (Phase 15).
 *
 * This file replaces the "call the parking office" stub that shipped for
 * Thursday. That stub's own comment is the spec for this one: *"a reset link is
 * an account takeover path... getting it half right is worse than not having
 * it"*. So the three things it would have been easy to get half right are
 * called out below, each next to the code that handles it.
 *
 * ── 1. `request-otp` must not reveal who has an account ────────────────────
 *
 * A sign-in form that says "no account with that email" is an enumeration
 * oracle, which is why `INVALID_CREDENTIALS_MESSAGE` exists in `./errors.ts`. A
 * forgot-password form is a *better* oracle, because it is anonymous, needs no
 * password guess, and in the naive implementation answers "we sent you a code"
 * or "no such account" in plain words.
 *
 * So `requestPasswordResetOtp` returns `void`. Not a boolean, not a reason code,
 * not an enum the caller might accidentally render — there is deliberately no
 * value for the route handler to leak, because the route handler never learns
 * which of the four branches below ran. Those branches are:
 *
 *    a. a registered account with a password  → store a code, email it
 *    b. no account with that address          → nothing
 *    c. a Google-only account (no password)   → nothing  (D3: `passwordHash` is
 *                                                NULL, so there is no password
 *                                                to reset)
 *    d. a code issued under 60 seconds ago    → nothing
 *
 * Which also means two kinds of leak have to be closed, not one. Not saying it
 * is easy; not *timing* it is the part that gets forgotten. See
 * `equalizeResponseTime` and the decoy hash.
 *
 * ── 2. A 6-digit code is only as strong as its attempt limit ───────────────
 *
 * One in a million is not a secret if you may guess a million times.
 * `resetPasswordWithOtp` is built around the counter, not around the compare:
 * expiry first, lockout before the compare, atomic increment on a wrong code.
 * The shape is ported from `reliableverify`'s `otpGuard.ts`, where it exists
 * because an earlier version counted attempts on only one of three endpoints and
 * the other two were freely brute-forceable.
 *
 * ── 3. A reset must not hand out a session ─────────────────────────────────
 *
 * `resetPasswordWithOtp` returns nothing either. It changes the password and
 * stops; the app sends the customer to the sign-in screen. The alternative —
 * answering with an `AuthSession` so they skip a step — would mean a mailbox
 * compromise yields a 30-day bearer token that D3 gives us no way to revoke.
 *
 * ── Known gaps, deliberately not closed here ───────────────────────────────
 *
 *  - **No IP-based rate limiting.** Phase 15's scope note says to flag it rather
 *    than build it. The per-code counter caps guesses against a *known* address
 *    and the cooldown caps codes per address, but nothing here stops one host
 *    from calling `request-otp` for ten thousand different addresses. That wants
 *    infrastructure (Nginx `limit_req` on the VPS, or a shared store) rather
 *    than another column — the honest note is that this file cannot fix it.
 *  - **A reset does not invalidate existing sessions**, including on other
 *    devices. Identical to the limitation documented on
 *    `app/api/profile/change-password/route.ts`, and for the same reason: D3
 *    sessions are stateless JWTs with no server-side record. Changing that is a
 *    change to the auth model.
 */
import { after } from 'next/server';

import { OTP_RESEND_COOLDOWN_SECONDS } from '@parking/shared';

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/notifications/email';
import { buildPasswordResetEmail } from '@/lib/notifications/password-reset-email';
import { getBusinessName } from '@/lib/settings';
import { ACCOUNT_DISABLED_MESSAGE, AuthFailure } from './errors';
import { generateOtp, OTP_MAX_ATTEMPTS, otpExpiry } from './otp';
import { hashPassword, verifyPassword } from './password';

/**
 * The floor every `request-otp` response is held to, in milliseconds.
 *
 * Returning the same JSON for all four branches is half the job; taking the same
 * time is the other half. "No such account" is naturally the cheapest branch and
 * "store a code and send an email" the most expensive, so an attacker who cannot
 * read the body can still read the clock.
 *
 * Two things close that, and the floor is the lesser one:
 *
 *  1. Every branch pays for exactly one bcrypt hash at cost 12 (~250ms on a
 *     modest VPS — see `password.ts`), real or decoy. That is the dominant cost
 *     and it is identical by construction, the same trick `verifyPassword` plays
 *     with `TIMING_DECOY_HASH`.
 *  2. The remaining difference is one or two indexed queries on a tiny table —
 *     low single-digit milliseconds, already under network jitter. This floor
 *     buries it anyway, so the measurement is of the clock, not of the branch.
 *
 * The email send is not in the measured window at all: it runs in `after()`,
 * once the response is already out. That is what makes a fixed floor possible —
 * otherwise the window would include an HTTP call to Brevo whose latency is
 * nobody's to predict, and no floor short enough to be usable could hide it.
 *
 * 600ms is chosen to sit comfortably above the bcrypt cost on the launch VPS. A
 * customer tapping "Send code" waits that long once.
 */
const REQUEST_OTP_MIN_DURATION_MS = 600;

/** Holds the caller until `REQUEST_OTP_MIN_DURATION_MS` has passed since `startedAt`. */
async function equalizeResponseTime(startedAt: number): Promise<void> {
  const remaining = REQUEST_OTP_MIN_DURATION_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/**
 * Burns one bcrypt hash and throws the result away.
 *
 * `hashPassword(generateOtp())` rather than a `verifyPassword` decoy, because
 * only a *hash* matches what the sending branch does: the module-level decoy in
 * `password.ts` is a cost-10 compare, and the difference between cost 10 and
 * cost 12 is a factor of four — visible on a clock in exactly the way this is
 * meant to prevent.
 */
async function burnHashingTime(): Promise<void> {
  await hashPassword(generateOtp());
}

/* ─────────────────────────── Step 1: request ───────────────────────────── */

/**
 * Issues a reset code for `email` if — and only if — that address belongs to an
 * active account with a password, and no code was issued for it in the last
 * `OTP_RESEND_COOLDOWN_SECONDS`.
 *
 * Returns `void` in every case, takes the same time in every case, and throws
 * only on a genuine fault (a dead database). The email itself is dispatched in
 * `after()`, so a slow or broken Brevo cannot delay or fail this call — a
 * customer who gets no email taps "Resend code", which is the right remedy
 * anyway, since the usual cause is a mistyped address.
 *
 * `email` is expected pre-normalised by `EmailSchema` (trimmed, lower-cased),
 * which is how `User.email` is stored.
 */
export async function requestPasswordResetOtp(email: string): Promise<void> {
  const startedAt = Date.now();

  // Both lookups run on every branch, including the ones that will do nothing
  // with the result. Short-circuiting the user lookup when a cooldown is active
  // would make that branch measurably cheaper than the others for no gain.
  const [latestCode, user] = await Promise.all([
    prisma.passwordResetCode.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, consumedAt: true, expiresAt: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true, isActive: true },
    }),
  ]);

  const now = new Date();

  // The resend cooldown. Only a code that is still *usable* holds the door shut:
  // once it has expired or been spent, a new request is a legitimate retry, not
  // a duplicate.
  const cooldownActive =
    latestCode !== null &&
    latestCode.consumedAt === null &&
    latestCode.expiresAt > now &&
    now.getTime() - latestCode.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000;

  // D3: a Google-only account has `passwordHash === null` — there is no password
  // to reset, and emailing a code that leads to setting one would quietly turn a
  // Google account into a password account from the outside. The disabled check
  // (§22) is here for the same reason it is in `authenticateWithPassword`: an
  // account an admin switched off should not be reachable by any route back in.
  const resettable = user !== null && user.passwordHash !== null && user.isActive;

  if (cooldownActive || !resettable) {
    await burnHashingTime();
    await equalizeResponseTime(startedAt);
    return;
  }

  const code = generateOtp();
  const codeHash = await hashPassword(code);

  // Clearing this address's old rows first is what keeps "at most one live code
  // per email" true, so the verify step never has to wonder which of two codes
  // the customer is holding. It also means requesting a new code invalidates the
  // old one, which is what a customer who just tapped "Resend" expects.
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetCode.deleteMany({ where: { email } });
    await tx.passwordResetCode.create({
      data: { email, codeHash, expiresAt: otpExpiry() },
    });
  });

  // Dispatched after the response, so Brevo's latency is outside the window
  // `equalizeResponseTime` is flattening. `getBusinessName()` is in here too
  // rather than above for the same reason — it is only needed to render the
  // mail, so it has no business being on the measured path.
  after(async () => {
    try {
      await sendEmail(
        buildPasswordResetEmail({ to: email, code, businessName: await getBusinessName() }),
      );
    } catch (error) {
      // Nothing to tell the caller — it has long since had its generic success,
      // and by design cannot be told that this address even exists. The stored
      // code stays valid for its 10 minutes; the customer's "Resend code" button
      // is the retry. This log is the only place a misconfigured BREVO_API_KEY
      // or an unverified EMAIL_FROM shows up, so it says which address failed.
      console.error(`[auth/forgot-password] could not email a reset code to ${email}:`, error);
    }
  });

  await equalizeResponseTime(startedAt);
}

/* ─────────────────────────── Step 2: verify ────────────────────────────── */

/** "Request a fresh one" — the answer to a code that is gone, spent or stale. */
const CODE_UNUSABLE_MESSAGE =
  'That code is no longer valid. Request a new one and try again.';

const CODE_EXPIRED_MESSAGE =
  'That code has expired. Request a new one and try again.';

const CODE_LOCKED_MESSAGE =
  'Too many incorrect attempts. Request a new code to try again.';

/**
 * Spends a code and sets the new password.
 *
 * Order is the security property, not an implementation detail:
 *
 *   1. find the code            — nothing to check against, nothing to count
 *   2. consumed? expired?       — before spending an attempt on a dead code
 *   3. already locked?          — *before* the compare, so a locked code cannot
 *                                 be tested at all
 *   4. compare the hash         — the only place the guess is examined
 *   5. wrong → atomic increment — the counter is the brute-force defence, so it
 *                                 must move on the same request that guessed
 *   6. right → re-check the account, then update password + consume, in one
 *                                 transaction
 *
 * Throws `AuthFailure`, which `respondWithAuthError` maps onto the API envelope.
 * Deliberately never `UNAUTHORIZED`: `apps/mobile/src/lib/api.ts` signs the user
 * out on that code, and while these calls are anonymous (so nothing would
 * actually be signed out today), reaching for 401 in a password flow is how that
 * stops being true later.
 */
export async function resetPasswordWithOtp(input: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<void> {
  const code = await prisma.passwordResetCode.findFirst({
    where: { email: input.email },
    orderBy: { createdAt: 'desc' },
  });

  // No code on file. Note what this does and does not reveal: it says a reset is
  // not in progress for this address, which is not the same as saying whether an
  // account exists — `request-otp` would have answered identically either way,
  // so a prober learns nothing it did not supply itself.
  if (!code || code.consumedAt !== null) {
    throw new AuthFailure('CONFLICT', CODE_UNUSABLE_MESSAGE);
  }

  // Said plainly rather than folded into the generic message: "expired" tells
  // the customer the code they are holding was real and the fix is to ask for a
  // fresh one, which is a different action from "check what you typed".
  if (code.expiresAt <= new Date()) {
    throw new AuthFailure('CONFLICT', CODE_EXPIRED_MESSAGE);
  }

  // Checked before the compare. A locked code must not be testable at all —
  // otherwise the ceiling caps how many answers you are *told* about, not how
  // many you may try.
  if (code.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AuthFailure('RATE_LIMITED', CODE_LOCKED_MESSAGE);
  }

  if (!(await verifyPassword(input.otp, code.codeHash))) {
    // `increment`, not `attempts + 1` read-modify-written in JS: two requests
    // racing on the same code would otherwise both write the same value and buy
    // an extra guess each.
    const updated = await prisma.passwordResetCode.update({
      where: { id: code.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AuthFailure('RATE_LIMITED', CODE_LOCKED_MESSAGE);
    }

    const remaining = OTP_MAX_ATTEMPTS - updated.attempts;
    // `VALIDATION_ERROR` with a `fields.otp` entry so the message lands under
    // the code input (`applyApiError` routes it there), where someone who
    // mistyped a digit is already looking. The remaining count is safe to show:
    // the limit is not a secret, and knowing how many tries are left is what
    // stops a customer burning the last one on another guess at the wrong code.
    const message = `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`;
    throw new AuthFailure('VALIDATION_ERROR', message, { fields: { otp: [message] } });
  }

  // Re-read the account now rather than trusting the check `request-otp` made up
  // to ten minutes ago: an admin may have disabled it in between (§22).
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, isActive: true },
  });

  if (!user || user.passwordHash === null) {
    // Unreachable in practice — a code is only ever stored for an account that
    // had a password, and `passwordHash` never goes back to NULL (linking Google
    // to an existing account leaves it alone — see `authenticateWithGoogle`).
    // Kept as a backstop because the alternative, if it ever did happen, is
    // writing a password onto the wrong kind of account.
    throw new AuthFailure('CONFLICT', CODE_UNUSABLE_MESSAGE);
  }

  if (!user.isActive) {
    // Safe to say plainly, unlike at sign-in: whoever is reading this has just
    // proved control of the account's mailbox, so it is a fact about their own
    // account rather than a confirmation handed to a stranger.
    throw new AuthFailure('FORBIDDEN', ACCOUNT_DISABLED_MESSAGE);
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    // `updateMany` with `consumedAt: null` in the filter, not `update` by id:
    // this is the single-use guarantee, and it has to be a condition the
    // database checks rather than one this code checked a few milliseconds ago.
    // Two requests arriving with the same correct code would both pass the read
    // at the top of this function; only one of them matches a row here.
    const consumed = await tx.passwordResetCode.updateMany({
      where: { id: code.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count === 0) {
      // The other request won. Rolling back rather than writing the password
      // again — same password, so the outcome is identical either way, but one
      // code spent on one change is the invariant worth keeping.
      throw new AuthFailure('CONFLICT', CODE_UNUSABLE_MESSAGE);
    }

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });
  });
}
