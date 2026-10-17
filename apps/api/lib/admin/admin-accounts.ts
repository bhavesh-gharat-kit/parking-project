/**
 * Super-admin account management: projections, audit log, and the "last super
 * admin" guard shared by the update and delete routes.
 */
import type { AdminAccount, AdminAuditEvent, AdminAuditAction } from '@parking/shared';

import type { User } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

import { toAdminUser } from './users';

export async function toAdminAccount(user: User): Promise<AdminAccount> {
  const [bookingsReviewed, passesReviewed, complaintsResolved] = await Promise.all([
    prisma.booking.count({ where: { reviewedById: user.id } }),
    prisma.passBooking.count({ where: { reviewedById: user.id } }),
    prisma.complaint.count({ where: { resolvedById: user.id } }),
  ]);

  return { ...toAdminUser(user), activity: { bookingsReviewed, passesReviewed, complaintsResolved } };
}

export async function recordAdminAudit(input: {
  actor: { userId: string; email: string };
  target: { id: string | null; email: string };
  action: AdminAuditAction;
  note?: string;
}): Promise<void> {
  await prisma.adminAuditEvent.create({
    data: {
      actorId: input.actor.userId,
      actorEmail: input.actor.email,
      targetId: input.target.id,
      targetEmail: input.target.email,
      action: input.action,
      note: input.note ?? null,
    },
  });
}

export function toAdminAuditEvent(row: {
  id: string;
  actorEmail: string;
  targetEmail: string;
  action: string;
  note: string | null;
  createdAt: Date;
}): AdminAuditEvent {
  return {
    id: row.id,
    actorEmail: row.actorEmail,
    targetEmail: row.targetEmail,
    action: row.action,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Whether any *other* enabled super admin exists — the system must never end up with none. */
export async function hasOtherActiveSuperAdmin(excludingId: string): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', isActive: true, id: { not: excludingId } },
  });
  return count > 0;
}
