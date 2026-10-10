/**
 * POST /api/cron/expire-passes — the pass expiry sweep (`_/decisions.md` D5
 * point 9). Mirrors `app/api/cron/expire-bookings/route.ts` exactly — same
 * cron-hit-a-route deployment reasoning, same shared-secret auth, same
 * compare-and-swap via `transitionPassBooking`.
 *
 * The one real difference: `PassBookingStatus` has deliberately no `EXPIRED`
 * value (D5 point 3 — "active" vs "expired" is always a read-time comparison
 * against `endDate`, never a stored transition). So an application abandoned
 * before payment is swept into `CANCELLED` instead, with a system-authored
 * `PassStatusEvent` note explaining why — reusing the existing terminal
 * status rather than inventing a new one.
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { SWEEPABLE_PASS_BOOKING_STATUSES, type PassExpirySweepResult } from '@parking/shared';

import { transitionPassBooking } from '@/lib/passes/transitions';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok } from '@/lib/http';
import { getPassExpiryMinutes } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mirrors `BATCH_LIMIT` in `expire-bookings` — see that file for why. */
const BATCH_LIMIT = 200;

/** Constant-time bearer-token check — identical to `expire-bookings`'s `isAuthorised`. */
function isAuthorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest) {
  const secret = env.CRON_SECRET;

  if (!secret) {
    return fail(
      'SERVICE_UNAVAILABLE',
      'The expiry sweep is not configured: set CRON_SECRET on the server.',
    );
  }

  if (!isAuthorised(req, secret)) {
    return fail('UNAUTHORIZED', 'This endpoint requires the cron secret.');
  }

  const sweptAt = new Date();
  const expiryMinutes = await getPassExpiryMinutes();

  // The cutoff is each row's own stored `expiresAt` (fixed at creation from
  // the window in force then), not `now - expiryMinutes` — same reasoning as
  // `expire-bookings`: shortening the setting must not retroactively cancel
  // an older application created under a longer window.
  const candidates = await prisma.passBooking.findMany({
    where: {
      status: { in: [...SWEEPABLE_PASS_BOOKING_STATUSES] },
      expiresAt: { not: null, lte: sweptAt },
    },
    select: { id: true, passNumber: true },
    orderBy: { expiresAt: 'asc' },
    take: BATCH_LIMIT,
  });

  let cancelled = 0;

  for (const candidate of candidates) {
    const result = await transitionPassBooking({
      passBookingId: candidate.id,
      to: 'CANCELLED',
      allowedFrom: SWEEPABLE_PASS_BOOKING_STATUSES,
      // NULL actor: the system did this, not a person.
      actor: null,
      note: `Cancelled automatically after ${expiryMinutes} minutes without completion (D5 point 9)`,
    });

    if (result.ok) {
      cancelled += 1;
      continue;
    }

    // `ILLEGAL_STATUS`/`RACED` are the expected outcome of a lost race (the
    // customer completed payment in the same second) and are not errors.
    if (result.reason !== 'ILLEGAL_STATUS' && result.reason !== 'RACED') {
      console.warn(
        `[cron/expire-passes] could not cancel ${candidate.passNumber}: ${result.reason}`,
      );
    }
  }

  if (cancelled > 0) {
    console.log(`[cron/expire-passes] cancelled ${cancelled}/${candidates.length} pass(es).`);
  }

  const payload: PassExpirySweepResult = {
    cancelled,
    examined: candidates.length,
    hasMore: candidates.length === BATCH_LIMIT,
    sweptAt: sweptAt.toISOString(),
    expiryMinutes,
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
