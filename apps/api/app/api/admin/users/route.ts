/**
 * GET /api/admin/users — the admin's user list (context.txt §22).
 *
 * `search` matches name/email/phone; `isActive` narrows to enabled or disabled
 * accounts (an admin re-enabling someone needs to find them among the
 * disabled, so the default lists everyone, active or not — same convention as
 * `GET /api/admin/locations`, Phase 04).
 *
 * `GET /api/admin/users/:id` (profile) and `PATCH /api/admin/users/:id`
 * (disable/enable) are Phase 07's write half of this screen.
 */
import type { NextRequest } from 'next/server';

import { AdminUserListQuerySchema, type AdminUser, type Paginated } from '@parking/shared';

import { toAdminUser } from '@/lib/admin/users';
import { requireRole } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = AdminUserListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!query.success) return failValidation(query.error);

  const { page, pageSize, search, isActive } = query.data;

  const where = {
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const payload: Paginated<AdminUser> = {
    items: rows.map(toAdminUser),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
