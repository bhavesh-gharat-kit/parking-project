/**
 * GET/PATCH /api/admin/users/:id — one user's profile, and the disable/enable
 * switch (context.txt §22).
 *
 * Booking history is deliberately not embedded here: the admin's user-detail
 * screen fetches it separately from `GET /api/admin/bookings?userId=:id`, the
 * same endpoint the booking queue uses, rather than this route growing a
 * second, differently-shaped list.
 *
 * `isActive: false` is the whole "disable" mechanism (§22 — "should not need to
 * manually manage user passwords"). `requireUser` already refuses a disabled
 * account's token (`apps/api/lib/auth/guard.ts`), so flipping this one column is
 * sufficient to cut off access immediately, even mid-session.
 */
import type { NextRequest } from 'next/server';

import { AdminUserSetActiveRequestSchema } from '@parking/shared';

import { toAdminUser } from '@/lib/admin/users';
import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail('NOT_FOUND', 'That user could not be found.');

  return ok(toAdminUser(user), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // An admin disabling their own account would lock themselves out immediately
  // (the guard re-reads the DB row on every request, not just at token expiry) —
  // a foot-gun worth refusing rather than a scenario worth trusting a confirm
  // dialog alone to prevent.
  if (id === auth.actor.userId) {
    return fail('FORBIDDEN', 'You cannot disable your own account.');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return fail('NOT_FOUND', 'That user could not be found.');

  const body = await parseJsonBody(req, AdminUserSetActiveRequestSchema);
  if (!body.ok) return body.response;

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: body.data.isActive },
  });

  return ok(toAdminUser(user), { headers: { 'Cache-Control': 'no-store' } });
}
