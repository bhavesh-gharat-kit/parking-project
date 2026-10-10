/** GET /api/complaints/:id — one of the signed-in user's own complaints. */
import type { NextRequest } from 'next/server';

import { requireUser } from '@/lib/auth/guard';
import { complaintInclude, toComplaint } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const row = await prisma.complaint.findFirst({
    where: { id, userId: auth.actor.userId },
    include: complaintInclude,
  });
  if (!row) return fail('NOT_FOUND', 'That complaint could not be found.');

  return ok(toComplaint(row), { headers: { 'Cache-Control': 'no-store' } });
}
