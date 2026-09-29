/**
 * POST /api/push-tokens — the RN app registers its Expo push token after
 * sign-in (decisions.md D4).
 *
 * `PushToken.token` is `@unique`, not `@@unique([userId, token])`: the same
 * physical device token can only ever belong to one account at a time, so this
 * is an upsert keyed on the token itself. Two cases fall out of that:
 *
 *  - A fresh token, or the same customer re-registering the same device (app
 *    reinstall, token unchanged) — `isActive` is set back to `true`.
 *  - The same device token now showing up for a different account — a phone
 *    that was signed out and a different customer signed in on it. The token
 *    row simply moves to the new `userId`, per the schema's own comment: "if
 *    the same device token reappears under a different account it should
 *    move, not duplicate."
 */
import type { NextRequest } from 'next/server';

import { RegisterPushTokenRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/auth/route-helpers';
import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, RegisterPushTokenRequestSchema);
  if (!body.ok) return body.response;

  const { token, platform, deviceName } = body.data;

  await prisma.pushToken.upsert({
    where: { token },
    create: {
      userId: auth.actor.userId,
      token,
      platform,
      deviceName: deviceName ?? null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    update: {
      userId: auth.actor.userId,
      platform,
      deviceName: deviceName ?? null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });

  return ok({ registered: true }, { headers: { 'Cache-Control': 'no-store' } });
}
