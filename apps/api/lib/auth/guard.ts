/**
 * Server-side authorisation. Every protected route handler starts here.
 *
 * Usage, and the reason it returns a result instead of throwing — a handler reads
 * top to bottom with the authorisation visible in the first two lines:
 *
 * ```ts
 * export async function GET(req: NextRequest) {
 *   const auth = await requireRole(req, 'ADMIN');
 *   if (!auth.ok) return auth.response;
 *   //  auth.actor.userId / auth.actor.role are now trustworthy
 * }
 * ```
 *
 * ── Why this re-reads the database ──────────────────────────────────────────
 *
 * The session token carries a `role` claim, and it would be cheaper to authorise
 * straight off it. But that claim is a snapshot of who the account was when it
 * signed in, and these tokens live for 30 days (`AUTH_SESSION_MAX_AGE_DAYS`).
 * Authorising off the claim alone would mean:
 *
 *   - demoting an admin, or disabling a user (§22), does nothing until their token
 *     expires — up to a month of access the business thinks it revoked;
 *   - promoting someone to ADMIN in the database does nothing until they sign in
 *     again, which is confusing rather than dangerous, but still wrong.
 *
 * So the claim is used for one thing only: telling the *app* which navigation
 * stack to open (context.txt §19), which is a UX decision, not a permission. The
 * `User` row is what decides access. That costs one primary-key read per protected
 * request, which at this system's traffic is not a number worth optimising — and
 * the guard is where a stale-permissions bug would be most expensive to find.
 *
 * context.txt §4: the client's idea of its own role is never consulted. The role
 * is not read from a header, a body field or a query parameter anywhere in this
 * codebase — only from the database row the verified token points at.
 */
import type { NextResponse } from 'next/server';

import type { UserRole } from '@parking/shared';

import { prisma } from '@/lib/db';
import { fail } from '@/lib/http';
import { ACCOUNT_DISABLED_MESSAGE } from './errors';
import { readSessionClaims } from './session';

/** The verified caller. Everything on it came from the database, not the request. */
export type Actor = {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
};

export type GuardResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: NextResponse };

type GuardRequest = Request | { headers: Headers };

/**
 * Resolves the caller, or `null` if the request carries no usable session.
 *
 * Use this only where anonymous access is legitimate and the answer merely
 * differs when signed in. For anything protected, use `requireUser` /
 * `requireRole` so the failure response is consistent across endpoints.
 */
export async function getActor(req: GuardRequest): Promise<Actor | null> {
  const claims = await readSessionClaims(req);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  // Covers a deleted account and a disabled one (§22) alike: a token can outlive
  // the row it refers to.
  if (!user || !user.isActive) return null;

  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}

/** Any signed-in, enabled account. */
export async function requireUser(req: GuardRequest): Promise<GuardResult> {
  const claims = await readSessionClaims(req);

  if (!claims) {
    return {
      ok: false,
      response: fail('UNAUTHORIZED', 'Please sign in to continue.'),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user) {
    return {
      ok: false,
      response: fail('UNAUTHORIZED', 'This session is no longer valid. Please sign in again.'),
    };
  }

  if (!user.isActive) {
    return { ok: false, response: fail('FORBIDDEN', ACCOUNT_DISABLED_MESSAGE) };
  }

  return {
    ok: true,
    actor: { userId: user.id, email: user.email, name: user.name, role: user.role },
  };
}

/**
 * A signed-in account holding `role`.
 *
 * Every handler under `app/api/admin/**` calls this with `'ADMIN'`. A `USER`'s
 * valid token gets 403 — authenticated, but not allowed — which is what the
 * Phase 02 acceptance test checks with curl.
 */
export async function requireRole(req: GuardRequest, role: UserRole): Promise<GuardResult> {
  const result = await requireUser(req);
  if (!result.ok) return result;

  if (result.actor.role !== role) {
    // No detail about what was required, and the same message whatever the
    // endpoint: a customer poking at admin URLs learns nothing from the answer.
    return {
      ok: false,
      response: fail('FORBIDDEN', 'You do not have permission to perform this action.'),
    };
  }

  return result;
}
