/**
 * GET /api/complaint-categories — the common issue titles offered in the
 * "Raise a complaint" form. Active ones only; "Other" is added by the client.
 */
import type { NextRequest } from 'next/server';

import type { ComplaintCategory } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { toComplaintCategory } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const rows = await prisma.complaintCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });

  const payload: ComplaintCategory[] = rows.map(toComplaintCategory);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
