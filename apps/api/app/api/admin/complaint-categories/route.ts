/** GET/POST /api/admin/complaint-categories — manage the common issue titles. */
import type { NextRequest } from 'next/server';

import { ComplaintCategoryRequestSchema, type ComplaintCategory } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toComplaintCategory } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const rows = await prisma.complaintCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] });
  const payload: ComplaintCategory[] = rows.map(toComplaintCategory);
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, ComplaintCategoryRequestSchema);
  if (!body.ok) return body.response;

  const existing = await prisma.complaintCategory.findUnique({ where: { title: body.data.title } });
  if (existing) return fail('CONFLICT', 'An issue with this title already exists.');

  const row = await prisma.complaintCategory.create({ data: body.data });
  return ok(toComplaintCategory(row), { status: 201 });
}
