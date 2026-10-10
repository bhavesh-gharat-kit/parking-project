/** GET /api/admin/complaints — every complaint, filterable by status, issue and text. */
import type { NextRequest } from 'next/server';

import { AdminComplaintListQuerySchema, type AdminComplaint, type Paginated } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { complaintInclude, toAdminComplaint } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = AdminComplaintListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);
  const { page, pageSize, status, categoryId, search } = query.data;

  const where = {
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { user: { email: { contains: search } } },
            { user: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      include: complaintInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.complaint.count({ where }),
  ]);

  const payload: Paginated<AdminComplaint> = {
    items: rows.map(toAdminComplaint),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
