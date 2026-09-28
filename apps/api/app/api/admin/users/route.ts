/**
 * GET /api/admin/users — the admin's user list (context.txt §22).
 *
 * Read-only, and small on purpose. Phase 02 needed at least one route under
 * `app/api/admin/**` for role enforcement to be a thing that can be tested rather
 * than asserted — this is that route, and the shape every later admin handler
 * copies: `requireRole` first, two lines, before anything else happens.
 *
 * Disabling a user (the write half of §22) is not here; the guard is what Phase 02
 * owes, and `requireUser` already refuses a disabled account's token, so the
 * mechanism is in place for whichever phase adds the button.
 */
import type { NextRequest } from 'next/server';

import { PaginationQuerySchema, type Paginated, type SessionUser } from '@parking/shared';

import { requireRole } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { failValidation, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the admin list shows beyond the public projection. */
type AdminUserRow = SessionUser & {
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** How the account signs in — useful when a customer says "I use the Google button". */
  signInMethods: ('PASSWORD' | 'GOOGLE')[];
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const query = PaginationQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!query.success) return failValidation(query.error);

  const { page, pageSize } = query.data;

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        imageUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        // Never the hash itself — only whether one exists.
        passwordHash: true,
        googleId: true,
      },
    }),
    prisma.user.count(),
  ]);

  const payload: Paginated<AdminUserRow> = {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      imageUrl: row.imageUrl,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      signInMethods: [
        ...(row.passwordHash ? (['PASSWORD'] as const) : []),
        ...(row.googleId ? (['GOOGLE'] as const) : []),
      ],
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
