/**
 * PATCH /api/admin/complaint-categories/:id — rename, reorder, enable/disable.
 * There is no DELETE: a retired title is disabled so old complaints keep it.
 */
import type { NextRequest } from 'next/server';

import { ComplaintCategoryRequestSchema } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toComplaintCategory } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, ComplaintCategoryRequestSchema);
  if (!body.ok) return body.response;

  const { id } = await params;
  const current = await prisma.complaintCategory.findUnique({ where: { id } });
  if (!current) return fail('NOT_FOUND', 'Issue not found.');

  const clash = await prisma.complaintCategory.findFirst({
    where: { title: body.data.title, NOT: { id } },
    select: { id: true },
  });
  if (clash) return fail('CONFLICT', 'An issue with this title already exists.');

  const row = await prisma.complaintCategory.update({ where: { id }, data: body.data });
  return ok(toComplaintCategory(row));
}
