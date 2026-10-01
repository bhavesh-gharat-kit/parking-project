/**
 * POST /api/profile/change-password — the signed-in user changing their own
 * password (Phase 14).
 *
 * ── What authorises this ────────────────────────────────────────────────────
 *
 * Two things, and it needs both:
 *
 *  1. `requireUser`, which resolves the account from the Bearer token and the
 *     database row (not from the token's claims — see `lib/auth/guard.ts`).
 *  2. `currentPassword`, re-verified against the stored hash below.
 *
 * The session alone is deliberately not enough. D3 sessions are stateless JWTs
 * valid for up to `AUTH_SESSION_MAX_AGE_DAYS` (30), with no server-side record to
 * revoke, so a token lifted off an unlocked phone would otherwise be a one-request
 * account takeover: change the password, and the owner is locked out of an account
 * the thief now controls for a month. Knowing the current password is what stops
 * that, which is why the check is here and not optional.
 *
 * ── Whose password can be changed ──────────────────────────────────────────
 *
 * Only the caller's. `ChangePasswordRequestSchema` has no target-user field, and
 * the only identifier used below is `auth.actor.userId`. There is no admin
 * "reset someone's password" path in this file (or anywhere in the API — that is
 * still `npm run admin:create`, out of band), so holding an ADMIN role grants
 * nothing extra here.
 *
 * ── Known limitation, inherited from D3 ─────────────────────────────────────
 *
 * Changing the password does not invalidate tokens already issued, including ones
 * on other devices. Stateless JWT with no session table is a property of D3, and
 * revocation would need either a `passwordChangedAt` claim check on every request
 * or a token denylist — a change to the auth model, not to this endpoint.
 */
import type { NextRequest } from 'next/server';

import { ChangePasswordRequestSchema, type ChangePasswordResponse } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same framing as the `forgot-password` screen's copy: a Google account has no
 * password to lose, so there is nothing here to change either.
 *
 * Safe to say plainly, unlike at sign-in. This answer only ever reaches the
 * account holder — `requireUser` has already resolved them — so it tells them a
 * fact about their own account rather than confirming to a stranger which emails
 * are registered and how they sign in. The mobile app avoids showing the form at
 * all (`GET /api/profile` reports `hasPassword`); this is the backstop for a
 * stale client or a direct caller.
 */
const NO_PASSWORD_MESSAGE =
  'This account signs in with Google and has no password to change.';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, ChangePasswordRequestSchema);
  if (!body.ok) return body.response;

  const user = await prisma.user.findUnique({
    where: { id: auth.actor.userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    return fail('UNAUTHORIZED', 'This session is no longer valid. Please sign in again.');
  }

  if (user.passwordHash === null) {
    return fail('CONFLICT', NO_PASSWORD_MESSAGE);
  }

  if (!(await verifyPassword(body.data.currentPassword, user.passwordHash))) {
    // `VALIDATION_ERROR`, not `UNAUTHORIZED`, for two reasons. The session is
    // perfectly valid — it is one field of the body that is wrong — and the
    // mobile client signs the user out on any `UNAUTHORIZED` from an
    // authenticated call (`apps/mobile/src/lib/api.ts`), so answering 401 here
    // would log someone out for a typo. The `fields` key matches the form's own
    // field path, so the message lands under the input.
    return fail('VALIDATION_ERROR', 'Your current password is incorrect.', {
      fields: { currentPassword: ['Your current password is incorrect.'] },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.data.newPassword) },
  });

  const payload: ChangePasswordResponse = { changed: true };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
