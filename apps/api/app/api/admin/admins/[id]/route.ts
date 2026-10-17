/**
 * PATCH/DELETE /api/admin/admins/:id — block, unblock, rename, change role,
 * reset password, and hard-delete. Super admin only.
 *
 * Deleting is a true row delete. Every admin-action column that points at `User`
 * (`reviewedById`, `verifiedById`, event `actorId`, `resolvedById`) is
 * `onDelete: SetNull`, so booking/pass/complaint history survives with the actor
 * blanked; `AdminAuditEvent` keeps the email snapshot of who was deleted.
 *
 * Guardrails: nobody can block/delete/demote themselves, and the last enabled
 * super admin can never be removed, blocked or demoted.
 */
import type { NextRequest } from 'next/server';

import { AdminAccountUpdateRequestSchema } from '@parking/shared';

import {
  hasOtherActiveSuperAdmin,
  recordAdminAudit,
  toAdminAccount,
} from '@/lib/admin/admin-accounts';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { hashPassword } from '@/lib/auth/password';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function findStaff(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? user : null;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const target = await findStaff(id);
  if (!target) return fail('NOT_FOUND', 'That admin could not be found.');

  const body = await parseJsonBody(req, AdminAccountUpdateRequestSchema);
  if (!body.ok) return body.response;
  const { isActive, name, role, password } = body.data;

  const isSelf = id === auth.actor.userId;
  if (isSelf && (isActive === false || (role !== undefined && role !== target.role))) {
    return fail('FORBIDDEN', 'You cannot block or change the role of your own account.');
  }

  const losesSuperAdmin =
    target.role === 'SUPER_ADMIN' && (isActive === false || (role !== undefined && role !== 'SUPER_ADMIN'));
  if (losesSuperAdmin && !(await hasOtherActiveSuperAdmin(id))) {
    return fail('CONFLICT', 'There must always be at least one active super admin.');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  const events: { action: 'BLOCKED' | 'UNBLOCKED' | 'PASSWORD_RESET' | 'UPDATED'; note?: string }[] = [];
  if (isActive !== undefined && isActive !== target.isActive) {
    events.push({ action: isActive ? 'UNBLOCKED' : 'BLOCKED' });
  }
  if (password !== undefined) events.push({ action: 'PASSWORD_RESET' });
  if (role !== undefined && role !== target.role) {
    events.push({ action: 'UPDATED', note: `Role ${target.role} → ${role}` });
  }
  if (name !== undefined && name !== target.name) events.push({ action: 'UPDATED', note: 'Name changed' });

  for (const event of events) {
    await recordAdminAudit({
      actor: auth.actor,
      target: { id: updated.id, email: updated.email },
      ...event,
    });
  }

  return ok(await toAdminAccount(updated), { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (id === auth.actor.userId) return fail('FORBIDDEN', 'You cannot delete your own account.');

  const target = await findStaff(id);
  if (!target) return fail('NOT_FOUND', 'That admin could not be found.');

  if (target.role === 'SUPER_ADMIN' && !(await hasOtherActiveSuperAdmin(id))) {
    return fail('CONFLICT', 'There must always be at least one active super admin.');
  }

  const account = await toAdminAccount(target);

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    // Bookings, passes, vehicles or complaints *owned* by this account use
    // `onDelete: Restrict`; an admin who also used the app as a customer has some.
    return fail(
      'CONFLICT',
      'This account has its own bookings, passes or complaints and cannot be deleted. Block it instead.',
    );
  }

  const { bookingsReviewed, passesReviewed, complaintsResolved } = account.activity;
  await recordAdminAudit({
    actor: auth.actor,
    target: { id: null, email: target.email },
    action: 'DELETED',
    note: `Had reviewed ${bookingsReviewed} bookings, ${passesReviewed} passes, resolved ${complaintsResolved} complaints`,
  });

  return ok({ deleted: true });
}
