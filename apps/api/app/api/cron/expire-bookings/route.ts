/**
 * POST /api/cron/expire-bookings — the booking expiry sweep (context.txt §15).
 *
 * ── Why a route hit by the system cron, and not a framework scheduler ───────
 * This backend is deployed to a plain VPS under PM2 (Phase 11, decisions.md D1),
 * so there is no serverless cron to declare: Vercel Cron, `vercel.json`
 * schedules and the like do not exist on the target box. What does exist is
 * crond. So the sweep is an ordinary authenticated route and the schedule lives
 * next to the deployment:
 *
 *     # crontab -e   — every minute, quietly
 *     * * * * * curl -fsS -m 30 -X POST \
 *       -H "Authorization: Bearer $CRON_SECRET" \
 *       https://api.example.in/api/cron/expire-bookings >/dev/null
 *
 * Every minute is deliberate: the §15 window is 10 minutes, and a sweep that
 * ran hourly would leave a booking showing "Awaiting payment" for up to an hour
 * after it stopped being payable. The run is a single indexed query
 * (`@@index([status, expiresAt])`) that matches nothing most of the time.
 *
 * Node's own `setInterval` in the server process was the other option and is
 * worse here: PM2 can run more than one instance, and an in-process timer would
 * then sweep once per instance, silently, with no log line anyone can curl.
 *
 * ── Why it is authenticated with a shared secret ───────────────────────────
 * The URL is public. Without the secret anyone could run the sweep at will —
 * harmless in itself, but it is a state-changing endpoint and there is no reason
 * to leave it open. `requireRole('ADMIN')` would not fit: cron has no session.
 *
 * ── What "release any held state" amounts to ───────────────────────────────
 * Per decisions.md D2 there is no slot inventory, so an expired booking has no
 * reservation to give back: the release IS the status change, plus clearing
 * `expiresAt`. If physical slots are ever added (§8, §25), the slot would be
 * freed inside `transitionBooking`, not here.
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { SWEEPABLE_BOOKING_STATUSES, type ExpirySweepResult } from '@parking/shared';

import { transitionBooking } from '@/lib/bookings/transitions';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok } from '@/lib/http';
import { getBookingExpiryMinutes } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bookings expired per run. A minute-by-minute sweep never sees more than a
 * handful, so this only matters the first time it runs after an outage — where a
 * bounded run that reports `hasMore` beats one long transaction holding rows
 * while the next cron tick piles in behind it.
 */
const BATCH_LIMIT = 200;

/**
 * Constant-time comparison of the bearer token.
 *
 * `===` on a secret leaks its length and its matching prefix through timing.
 * That is a thin attack over the public internet, but the whole cost of not
 * having the weakness is this function.
 */
function isAuthorised(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(secret);

  // timingSafeEqual throws on a length mismatch, so the lengths have to be
  // compared first. Length alone is not the secret.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest) {
  const secret = env.CRON_SECRET;

  if (!secret) {
    // Not 401: the caller did nothing wrong, the server is unconfigured. Phase 11's
    // deploy checklist generates this value.
    return fail(
      'SERVICE_UNAVAILABLE',
      'The expiry sweep is not configured: set CRON_SECRET on the server.',
    );
  }

  if (!isAuthorised(req, secret)) {
    return fail('UNAUTHORIZED', 'This endpoint requires the cron secret.');
  }

  const sweptAt = new Date();
  const expiryMinutes = await getBookingExpiryMinutes();

  // The cutoff is the stored `expiresAt`, written at creation from the window
  // that was in force then — not `now - expiryMinutes`. So shortening the window
  // does not retroactively expire bookings that were created under a longer one,
  // which is both less surprising and what makes the dev test in
  // `scripts/verify-bookings.ts` (back-date one row, sweep, assert) meaningful.
  const candidates = await prisma.booking.findMany({
    where: {
      status: { in: [...SWEEPABLE_BOOKING_STATUSES] },
      expiresAt: { not: null, lte: sweptAt },
    },
    select: { id: true, bookingNumber: true },
    orderBy: { expiresAt: 'asc' },
    take: BATCH_LIMIT,
  });

  let expired = 0;

  for (const candidate of candidates) {
    // One transaction per booking rather than one `updateMany` for the batch:
    // each expiry has to write its own audit row (§21), and `allowedFrom` keeps
    // a booking that moved on between the query above and this write — a
    // customer submitting a UTR in the same second — from being expired anyway.
    const result = await transitionBooking({
      bookingId: candidate.id,
      to: 'EXPIRED',
      allowedFrom: SWEEPABLE_BOOKING_STATUSES,
      // NULL actor: the system did this, not a person (schema.prisma, §21).
      actor: null,
      note: `Expired automatically after ${expiryMinutes} minutes without completion (§15)`,
    });

    if (result.ok) {
      expired += 1;
      continue;
    }

    // `ILLEGAL_STATUS`/`RACED` are the expected outcome of a lost race and are
    // not errors. Anything else is worth a line in the PM2 log.
    if (result.reason !== 'ILLEGAL_STATUS' && result.reason !== 'RACED') {
      console.warn(
        `[cron/expire-bookings] could not expire ${candidate.bookingNumber}: ${result.reason}`,
      );
    }
  }

  // Phase 09 (decisions.md D4) sends the "your booking expired" push here, from
  // the ids collected above — the sweep is the only place that knows which
  // bookings just lapsed.

  if (expired > 0) {
    console.log(`[cron/expire-bookings] expired ${expired}/${candidates.length} booking(s).`);
  }

  const payload: ExpirySweepResult = {
    expired,
    examined: candidates.length,
    hasMore: candidates.length === BATCH_LIMIT,
    sweptAt: sweptAt.toISOString(),
    expiryMinutes,
  };

  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
