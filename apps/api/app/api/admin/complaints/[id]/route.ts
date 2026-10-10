/**
 * GET/PATCH /api/admin/complaints/:id — view a complaint, and move it along
 * (`COMPLAINT_TRANSITIONS`) with an optional note that the user sees.
 */
import type { NextRequest } from 'next/server';

import { ComplaintAdminUpdateRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { COMPLAINT_TRANSITIONS, complaintInclude, formatTicket, toAdminComplaint } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { sendComplaintPush } from '@/lib/push/send';
import { COMPLAINT_STATUS_LABELS } from '@parking/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const row = await prisma.complaint.findUnique({ where: { id }, include: complaintInclude });
  if (!row) return fail('NOT_FOUND', 'Complaint not found.');

  return ok(toAdminComplaint(row), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, ComplaintAdminUpdateRequestSchema);
  if (!body.ok) return body.response;
  const { status: to, resolutionNote } = body.data;

  const { id } = await params;
  const current = await prisma.complaint.findUnique({
    where: { id },
    select: { id: true, status: true, ticketNo: true, userId: true, title: true },
  });
  if (!current) return fail('NOT_FOUND', 'Complaint not found.');

  if (!COMPLAINT_TRANSITIONS[current.status].includes(to)) {
    return fail(
      'INVALID_STATE_TRANSITION',
      `A ${COMPLAINT_STATUS_LABELS[current.status].toLowerCase()} complaint cannot be moved to ${COMPLAINT_STATUS_LABELS[to].toLowerCase()}.`,
    );
  }

  const closing = to === 'RESOLVED' || to === 'REJECTED';
  if (closing && !resolutionNote) {
    return fail('VALIDATION_ERROR', 'Add a note explaining the outcome.', {
      fields: { resolutionNote: ['Add a note explaining the outcome.'] },
    });
  }

  // `updateMany` on the expected status makes this a compare-and-set, so two
  // admins acting at once cannot both "win" the same transition.
  const claimed = await prisma.complaint.updateMany({
    where: { id, status: current.status },
    data: {
      status: to,
      ...(resolutionNote ? { resolutionNote } : {}),
      ...(closing ? { resolvedAt: new Date(), resolvedById: auth.actor.userId } : {}),
    },
  });
  if (claimed.count === 0) {
    return fail('CONFLICT', 'This complaint was just updated by someone else. Reload and try again.');
  }

  await prisma.complaintStatusEvent.create({
    data: {
      complaintId: id,
      fromStatus: current.status,
      toStatus: to,
      actorId: auth.actor.userId,
      actorRole: auth.actor.role,
      note: resolutionNote ?? null,
    },
  });

  const updated = await prisma.complaint.findUniqueOrThrow({ where: { id }, include: complaintInclude });

  void sendComplaintPush(current.userId, {
    title: `Complaint ${formatTicket(current.ticketNo)} ${COMPLAINT_STATUS_LABELS[to].toLowerCase()}`,
    body: resolutionNote ?? current.title,
    complaintId: id,
  });

  return ok(toAdminComplaint(updated));
}
