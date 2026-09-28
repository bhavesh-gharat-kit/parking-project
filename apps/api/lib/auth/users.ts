/**
 * Account lookup, creation and credential checking.
 *
 * This is the only file that decides whether a sign-in succeeds. Both callers use
 * it unchanged:
 *   - the Auth.js Credentials providers in `apps/api/auth.ts` (cookie sessions,
 *     for the Phase 2 website),
 *   - the JSON route handlers under `app/api/auth/**` (Bearer tokens, for the app).
 *
 * That is the point of the split. Two implementations of "is this password right"
 * is how one of them ends up missing the `isActive` check.
 */
import type { SessionUser } from '@parking/shared';

import type { User } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import {
  ACCOUNT_DISABLED_MESSAGE,
  AuthFailure,
  INVALID_CREDENTIALS_MESSAGE,
} from './errors';
import { verifyGoogleIdToken } from './google';
import { hashPassword, verifyPassword } from './password';
import type { SessionSubject } from './session';

/** Prisma's error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * The public projection of a user. Note what it omits: `passwordHash`, and the
 * `isActive`/`googleId` bookkeeping. Route handlers return this, never a raw row,
 * so a new column on `User` cannot leak by being added.
 */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    imageUrl: user.imageUrl,
    role: user.role,
  };
}

export function toSessionSubject(user: User): SessionSubject {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    role: user.role,
  };
}

/* ─────────────────────── Email / password sign-up ──────────────────── */

/**
 * Creates a customer account.
 *
 * `role` is not a parameter. New accounts are `USER` because the column defaults
 * to it (see `schema.prisma`), and there is deliberately no argument here that
 * could be threaded back to a request body — context.txt §110-112. The first
 * admin is made by `scripts/create-admin.ts`, out of band.
 */
export async function registerWithPassword(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash,
        lastLoginAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Deliberately explicit, unlike the sign-*in* message. A sign-up form has
      // to tell you the address is taken or it is unusable, and an attacker can
      // learn the same fact by trying to register anyway.
      throw new AuthFailure('CONFLICT', 'An account with this email already exists.', {
        fields: { email: ['An account with this email already exists.'] },
        cause: error,
      });
    }
    throw error;
  }
}

/* ─────────────────────── Email / password sign-in ──────────────────── */

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });

  // No early return on a missing user: `verifyPassword` spends the bcrypt time
  // anyway (see `password.ts`), so both branches cost the same and the endpoint
  // cannot be used to find out which emails are registered.
  const passwordMatches = await verifyPassword(password, user?.passwordHash);

  if (!user || !passwordMatches) {
    throw new AuthFailure('UNAUTHORIZED', INVALID_CREDENTIALS_MESSAGE);
  }

  // Checked after the password, on purpose: telling an anonymous caller "that
  // account is disabled" would confirm the account exists.
  if (!user.isActive) {
    throw new AuthFailure('FORBIDDEN', ACCOUNT_DISABLED_MESSAGE);
  }

  return touchLastLogin(user);
}

/* ────────────────────────── Google sign-in ─────────────────────────── */

/**
 * Verifies a Google ID token and returns the account it belongs to, creating one
 * on first sign-in.
 *
 * Three cases, in order:
 *
 *  1. `googleId` already stored — the returning Google user. Cheapest, and the
 *     only match that does not involve the email at all, so it keeps working if
 *     the customer later changes their Google address.
 *  2. Same email, no `googleId` yet — someone who registered with a password and
 *     is now using the Google button. Link the two rather than failing with
 *     "email already exists", which from the customer's side would be nonsense.
 *     Safe only because `verifyGoogleIdToken` refused the token unless Google
 *     said `email_verified` (see the note there).
 *  3. Neither — a new customer. `role` comes from the schema default, `USER`.
 */
export async function authenticateWithGoogle(idToken: string): Promise<User> {
  const identity = await verifyGoogleIdToken(idToken);

  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: identity.googleSub },
  });

  if (byGoogleId) {
    if (!byGoogleId.isActive) {
      throw new AuthFailure('FORBIDDEN', ACCOUNT_DISABLED_MESSAGE);
    }
    return prisma.user.update({
      where: { id: byGoogleId.id },
      data: {
        // Refresh the cosmetic fields; leave anything the customer has edited
        // themselves (Phase 03) alone by only filling blanks.
        name: byGoogleId.name ?? identity.name,
        imageUrl: identity.imageUrl ?? byGoogleId.imageUrl,
        lastLoginAt: new Date(),
      },
    });
  }

  const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });

  if (byEmail) {
    if (!byEmail.isActive) {
      throw new AuthFailure('FORBIDDEN', ACCOUNT_DISABLED_MESSAGE);
    }
    if (byEmail.googleId && byEmail.googleId !== identity.googleSub) {
      // Two Google accounts claiming one verified email should not be possible;
      // if it happens, refusing is the only safe answer.
      throw new AuthFailure(
        'CONFLICT',
        'This email is already linked to a different Google account. Please contact support.',
      );
    }
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: identity.googleSub,
        name: byEmail.name ?? identity.name,
        imageUrl: byEmail.imageUrl ?? identity.imageUrl,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
      },
    });
  }

  try {
    return await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        googleId: identity.googleSub,
        imageUrl: identity.imageUrl,
        // Google verified it, so this account never needs an email-confirmation
        // step. `passwordHash` stays NULL — see `schema.prisma`.
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A double-tap on the Google button can put two requests in the create
      // branch at once; the loser of that race just reads the winner's row.
      const existing = await prisma.user.findUnique({ where: { email: identity.email } });
      if (existing) return existing;
    }
    throw error;
  }
}

/* ──────────────────────────── Internals ───────────────────────────── */

async function touchLastLogin(user: User): Promise<User> {
  return prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
