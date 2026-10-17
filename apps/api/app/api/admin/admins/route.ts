/**
 * GET/POST /api/admin/admins — admin-account management. Super admin only.
 *
 * GET returns the staff accounts plus the most recent audit events, so the web
 * page needs one request.
 */
import type { NextRequest } from 'next/server';

import {
  AdminAccountCreateRequestSchema,
  AdminAccountListQuerySchema,
  type AdminAccount,
  type AdminAuditEvent,
  type Paginated,
} from '@parking/shared';

import {
  recordAdminAudit,
  toAdminAccount,
  toAdminAuditEvent,
} from '@/lib/admin/admin-accounts';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { hashPassword } from '@/lib/auth/password';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) return auth.response;

  const query = AdminAccountListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);
  const { page, pageSize, search } = query.data;

  const where = {
    role: { in: ['ADMIN', 'SUPER_ADMIN'] as ('ADMIN' | 'SUPER_ADMIN')[] },
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

  const [rows, total, events] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    prisma.adminAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);

  const payload: Paginated<AdminAccount> & { auditEvents: AdminAuditEvent[] } = {
    items: await Promise.all(rows.map(toAdminAccount)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    auditEvents: events.map(toAdminAuditEvent),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, AdminAccountCreateRequestSchema);
  if (!body.ok) return body.response;
  const { email, name, phone, password, role } = body.data;

  // An existing customer is not silently promoted here — that would hand staff
  // powers to someone nobody chose. Use a fresh email for the new admin.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return fail('CONFLICT', 'An account with this email already exists.', {
      fields: { email: ['An account with this email already exists.'] },
    });
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      phone: phone ?? null,
      role,
      passwordHash: await hashPassword(password),
      // The super admin vouches for the mailbox.
      emailVerifiedAt: new Date(),
    },
  });

  await recordAdminAudit({
    actor: auth.actor,
    target: { id: created.id, email: created.email },
    action: 'CREATED',
    note: `Role ${role}`,
  });

  return ok(await toAdminAccount(created), { status: 201 });
}
