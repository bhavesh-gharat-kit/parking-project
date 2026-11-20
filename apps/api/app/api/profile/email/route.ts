/**
 * POST /api/profile/email — lets a pass-flow account replace its synthesized
 * `<phone>@phone.local` email with a real one (Phase 23, web only).
 *
 * Kept off `PATCH /api/profile` so the shared `UpdateProfileRequestSchema` the
 * Android profile screen posts to is unchanged.
 *
 * Authorisation: `requireUser` + the caller's own database row. The swap is
 * allowed ONLY while the stored email is the placeholder, so this cannot be used
 * to change a real login email (no takeover of, or drift on, normal accounts).
 * The write is also conditional on the placeholder in the `where`, so two racing
 * requests cannot both succeed.
 */
import type { NextRequest } from 'next/server';

import {
  PLACEHOLDER_EMAIL_SUFFIX,
  SetEmailRequestSchema,
  isPlaceholderEmail,
  type ProfileResponse,
} from '@parking/shared';

import { Prisma } from '@/generated/prisma/client';
import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { toSessionUser } from '@/lib/auth/users';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IN_USE = 'That email is already in use.';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, SetEmailRequestSchema);
  if (!body.ok) return body.response;
  const email = body.data.email; // trimmed + lower-cased by EmailSchema

  const current = await prisma.user.findUnique({ where: { id: auth.actor.userId } });
  if (!current) {
    return fail('UNAUTHORIZED', 'This session is no longer valid. Please sign in again.');
  }
  if (!isPlaceholderEmail(current.email)) {
    return fail('FORBIDDEN', 'Your email is already set and cannot be changed here.');
  }
  if (isPlaceholderEmail(email)) {
    return fail('VALIDATION_ERROR', 'Enter a valid email address', {
      fields: { email: ['Enter a valid email address'] },
    });
  }

  try {
    const result = await prisma.user.updateMany({
      where: { id: current.id, email: { endsWith: PLACEHOLDER_EMAIL_SUFFIX } },
      data: { email },
    });
    if (result.count === 0) {
      return fail('FORBIDDEN', 'Your email is already set and cannot be changed here.');
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('CONFLICT', IN_USE, { fields: { email: [IN_USE] } });
    }
    throw error;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  const payload: ProfileResponse = {
    user: toSessionUser(user),
    hasPassword: user.passwordHash !== null,
  };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
