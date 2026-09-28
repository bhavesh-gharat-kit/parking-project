/**
 * Phase 05 acceptance check, against a running API and its database.
 *
 *   npm run dev -w api                    # in another terminal
 *   npm run verify:bookings -w api        # http://localhost:3000
 *   API=https://api.yourdomain.in npx tsx scripts/verify-bookings.ts
 *
 * The three Phase 05 acceptance criteria are all statements about what the
 * *server* does regardless of what a client sends, which is not something a
 * screenshot of the app can demonstrate:
 *
 *   1. Creating a booking never lets the client influence `amount` — proven by
 *      POSTing a tampered amount (and a tampered status, start/end time and
 *      booking number) and checking every one of them was ignored.
 *   2. A booking left incomplete past its window flips to `EXPIRED` — proven by
 *      back-dating one booking's `expiresAt` and running the real sweep
 *      endpoint over it. Back-dating is the shortened interval the acceptance
 *      criterion asks for: it tests the actual production code path in a second
 *      instead of sleeping for ten minutes, and needs no dev-only parameter on
 *      the endpoint that could be abused in production.
 *   3. Booking and payment status are genuinely separate and independently
 *      queryable — proven by putting one booking in `PAYMENT_VERIFICATION` with
 *      a `VERIFICATION_PENDING` payment and another in `EXPIRED` with no
 *      payment row at all, then filtering on each axis and checking the two
 *      never move together.
 *
 * ── Why this is a TypeScript script and not bash like verify-auth.sh ───────
 * Criteria 2 and 3 need the database as well as the API: one to move time, the
 * other to set up the state Phase 06 will later produce. It reads the same
 * `.env` the server does, so it must be run against a DEVELOPMENT database.
 *
 * Like `verify-auth.sh`, it creates throwaway accounts at `@example.invalid`
 * (reserved by RFC 2606, so they can never receive mail) and leaves them
 * behind: `Booking`'s relations are `onDelete: Restrict` precisely so nothing a
 * receipt depends on can be deleted, and a verification script is not the place
 * to make an exception.
 */
import 'dotenv/config';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import type { ApiResponse, Booking, ExpirySweepResult, Paginated, ParkingLocation, ParkingRate, Vehicle } from '@parking/shared';

import { PrismaClient } from '../generated/prisma/client';

const API = process.env.API ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

let passed = 0;
let failed = 0;

function pass(description: string, detail?: string) {
  passed += 1;
  console.log(`  ok    ${description}${detail ? `  (${detail})` : ''}`);
}

function fail(description: string, detail: string) {
  failed += 1;
  console.log(`  FAIL  ${description}`);
  console.log(`        ${detail}`);
}

function check(description: string, condition: boolean, detail: string) {
  if (condition) pass(description);
  else fail(description, detail);
}

function checkEqual<T>(description: string, actual: T, expected: T) {
  if (actual === expected) pass(description, `${String(actual)}`);
  else fail(description, `expected ${String(expected)}, got ${String(actual)}`);
}

type Call = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  /** Raw Authorization header, for the cron secret. */
  authorization?: string;
};

type CallResult<T> = { status: number; payload: ApiResponse<T> | null };

async function call<T>(path: string, options: Call = {}): Promise<CallResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.authorization) headers.Authorization = options.authorization;

  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON: an Nginx page or a crash before the handler.
  }

  return { status: response.status, payload };
}

/** Unwraps a successful envelope, or aborts the run — a failed setup step makes
 *  every assertion after it meaningless, so there is nothing to be gained by
 *  carrying on. */
function expectData<T>(what: string, result: CallResult<T>): T {
  if (!result.payload?.ok) {
    throw new Error(
      `${what} failed: HTTP ${result.status} ${JSON.stringify(result.payload ?? null)}`,
    );
  }
  return result.payload.data;
}

async function registerThrowawayUser(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `verify-${label}-${stamp}@example.invalid`;
  const password = `verify-pass-${stamp}`;

  const session = expectData<{ token: string; user: { id: string } }>(
    `register ${email}`,
    await call('/api/auth/register', {
      method: 'POST',
      body: { name: `Verify ${label}`, email, password },
    }),
  );

  return { email, token: session.token, userId: session.user.id };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set — run this from apps/api.');
  if (!CRON_SECRET) {
    throw new Error(
      'CRON_SECRET is not set. The sweep endpoint refuses to run without it, so criterion 2 cannot be checked.',
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

  console.log(`\nPhase 05 booking verification against ${API}\n`);

  try {
    /* ── Setup ───────────────────────────────────────────────────────────── */

    const health = await call<{ database: string }>('/api/health');
    check('the API is up and reaching MySQL', health.status === 200, `HTTP ${health.status}`);

    const customer = await registerThrowawayUser('customer');
    const otherCustomer = await registerThrowawayUser('other');

    const car = expectData<Vehicle>(
      'create car',
      await call('/api/vehicles', {
        method: 'POST',
        token: customer.token,
        body: { number: `MH04VF${Math.floor(1000 + Math.random() * 8999)}`, type: 'CAR' },
      }),
    );

    const bike = expectData<Vehicle>(
      'create bike',
      await call('/api/vehicles', {
        method: 'POST',
        token: customer.token,
        body: { number: `MH04VB${Math.floor(1000 + Math.random() * 8999)}`, type: 'BIKE' },
      }),
    );

    const locations = expectData<ParkingLocation[]>(
      'list locations',
      await call('/api/locations', { token: customer.token }),
    );
    if (locations.length === 0) {
      throw new Error('No active parking locations. Run `npm run db:seed -w api` first.');
    }
    const location = locations[0];

    const carRates = expectData<ParkingRate[]>(
      'list car rates',
      await call(`/api/locations/${location.id}/rates?vehicleType=CAR`, { token: customer.token }),
    );
    if (carRates.length === 0) {
      throw new Error(`No active CAR rates at ${location.name}. Run \`npm run db:seed -w api\`.`);
    }
    const rate = carRates[0];

    console.log(`Setup: ${location.name} · ${rate.label} · ${rate.priceInPaise} paise\n`);

    /* ── Criterion 1: the client cannot influence the amount ─────────────── */

    console.log('Criterion 1 — the backend owns pricing (context.txt §32, §187-189)');

    const tampered = await call<Booking>('/api/bookings', {
      method: 'POST',
      token: customer.token,
      body: {
        locationId: location.id,
        vehicleId: car.id,
        rateId: rate.id,
        // None of these exist on BookingCreateRequestSchema. Every one of them
        // is something a tampering client would most want to set.
        amountInPaise: 1,
        amount: 1,
        priceInPaise: 1,
        status: 'CONFIRMED',
        paymentMethod: 'CASH',
        bookingNumber: 'KLY-000000-HACK',
        startTime: '2020-01-01T00:00:00.000Z',
        endTime: '2030-01-01T00:00:00.000Z',
        expiresAt: '2030-01-01T00:00:00.000Z',
        durationMinutes: 99999,
      },
    });

    checkEqual('a booking with tampered fields is still created', tampered.status, 201);
    const booking = expectData<Booking>('create booking', tampered);

    checkEqual(
      'amountInPaise came from the ParkingRate, not the request',
      booking.amountInPaise,
      rate.priceInPaise,
    );
    checkEqual('status is PENDING, not the requested CONFIRMED', booking.status, 'PENDING');
    checkEqual('paymentMethod is null until Phase 06, not the requested CASH', booking.paymentMethod, null);
    checkEqual('payment row does not exist yet', booking.payment, null);
    checkEqual('durationMinutes came from the rate', booking.durationMinutes, rate.durationMinutes);
    checkEqual('rateLabel was snapshotted from the rate', booking.rateLabel, rate.label);
    checkEqual('vehicleNumber was snapshotted from the vehicle', booking.vehicleNumber, car.number);

    const startTime = new Date(booking.startTime).getTime();
    const endTime = new Date(booking.endTime).getTime();
    checkEqual(
      'endTime is startTime + the rate duration',
      (endTime - startTime) / 60_000,
      rate.durationMinutes,
    );
    check(
      'startTime is now, not the requested 2020 date',
      Math.abs(startTime - Date.now()) < 120_000,
      `startTime ${booking.startTime}`,
    );
    check(
      'bookingNumber was generated server-side',
      /^[A-Z]{2,8}-\d{6}-[A-Z0-9]{4}$/.test(booking.bookingNumber) &&
        booking.bookingNumber !== 'KLY-000000-HACK',
      `got ${booking.bookingNumber}`,
    );
    check(
      'expiresAt is within the configured window, not the requested 2030 date',
      booking.expiresAt !== null &&
        new Date(booking.expiresAt).getTime() - startTime > 0 &&
        new Date(booking.expiresAt).getTime() - startTime <= 24 * 60 * 60_000,
      `expiresAt ${booking.expiresAt}`,
    );

    // The same rule from the other side: the row itself, not just the response.
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { amountInPaise: true, status: true, bookingNumber: true },
    });
    checkEqual('the stored row also holds the rate price', stored.amountInPaise, rate.priceInPaise);

    console.log('\nOwnership and package validity');

    const foreignVehicle = await call('/api/bookings', {
      method: 'POST',
      token: otherCustomer.token,
      body: { locationId: location.id, vehicleId: car.id, rateId: rate.id },
    });
    checkEqual(
      "another customer's vehicle reads as not found, not forbidden",
      foreignVehicle.status,
      404,
    );

    const mismatched = await call('/api/bookings', {
      method: 'POST',
      token: customer.token,
      body: { locationId: location.id, vehicleId: bike.id, rateId: rate.id },
    });
    checkEqual('a car package cannot be used to park a bike', mismatched.status, 422);

    const unknownRate = await call('/api/bookings', {
      method: 'POST',
      token: customer.token,
      body: { locationId: location.id, vehicleId: car.id, rateId: 'does-not-exist' },
    });
    checkEqual('an unknown package is rejected', unknownRate.status, 404);

    const anonymous = await call('/api/bookings', {
      method: 'POST',
      body: { locationId: location.id, vehicleId: car.id, rateId: rate.id },
    });
    checkEqual('creating a booking requires a session', anonymous.status, 401);

    /* ── Criterion 2: expiry ─────────────────────────────────────────────── */

    console.log('\nCriterion 2 — an incomplete booking expires (context.txt §15)');

    const unauthorisedSweep = await call('/api/cron/expire-bookings', { method: 'POST' });
    checkEqual('the sweep refuses a caller with no cron secret', unauthorisedSweep.status, 401);

    const wrongSecretSweep = await call('/api/cron/expire-bookings', {
      method: 'POST',
      authorization: `Bearer ${CRON_SECRET}x`,
    });
    checkEqual('the sweep refuses a wrong cron secret', wrongSecretSweep.status, 401);

    // A booking still inside its window must survive a sweep.
    const freshSweep = expectData<ExpirySweepResult>(
      'sweep (fresh booking)',
      await call('/api/cron/expire-bookings', {
        method: 'POST',
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );
    const afterFreshSweep = expectData<Booking>(
      'read booking',
      await call(`/api/bookings/${booking.id}`, { token: customer.token }),
    );
    checkEqual(
      'a booking inside its window is left alone',
      afterFreshSweep.status,
      'PENDING',
    );
    console.log(`        (window in force: ${freshSweep.expiryMinutes} minutes)`);

    // The shortened interval: move this one booking's deadline into the past.
    await prisma.booking.update({
      where: { id: booking.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const sweep = expectData<ExpirySweepResult>(
      'sweep (expired booking)',
      await call('/api/cron/expire-bookings', {
        method: 'POST',
        authorization: `Bearer ${CRON_SECRET}`,
      }),
    );
    check('the sweep expired at least one booking', sweep.expired >= 1, JSON.stringify(sweep));

    const expired = expectData<Booking>(
      'read booking',
      await call(`/api/bookings/${booking.id}`, { token: customer.token }),
    );
    checkEqual('the overdue booking is now EXPIRED', expired.status, 'EXPIRED');
    check('expiredAt was stamped', expired.expiredAt !== null, `got ${expired.expiredAt}`);
    checkEqual('expiresAt was cleared — nothing left to reclaim', expired.expiresAt, null);

    const expiryEvent = await prisma.bookingStatusEvent.findFirst({
      where: { bookingId: booking.id, toStatus: 'EXPIRED' },
      select: { fromStatus: true, actorId: true, note: true },
    });
    check('an audit event was written for the expiry (§21)', expiryEvent !== null, 'no event row');
    checkEqual('the expiry audit event has no actor — the system did it', expiryEvent?.actorId ?? null, null);
    checkEqual('the audit event records the status it came from', expiryEvent?.fromStatus ?? null, 'PENDING');

    const creationEvent = await prisma.bookingStatusEvent.findFirst({
      where: { bookingId: booking.id, toStatus: 'PENDING' },
      select: { fromStatus: true, actorId: true },
    });
    check('creation was audited too', creationEvent !== null, 'no creation event row');
    checkEqual('the creation event is attributed to the customer', creationEvent?.actorId ?? null, customer.userId);

    /* ── Criterion 3: two separate, independently queryable statuses ─────── */

    console.log('\nCriterion 3 — booking status and payment status are separate (context.txt §14, §32)');

    const awaitingAdmin = expectData<Booking>(
      'create second booking',
      await call('/api/bookings', {
        method: 'POST',
        token: customer.token,
        body: { locationId: location.id, vehicleId: car.id, rateId: rate.id },
      }),
    );

    // Stands in for Phase 06: the customer picked UPI and submitted a UTR, so the
    // booking is waiting on an admin and the money is unverified. Written
    // directly because the endpoints that will do this properly are Phase 06's.
    await prisma.booking.update({
      where: { id: awaitingAdmin.id },
      data: {
        status: 'PAYMENT_VERIFICATION',
        paymentMethod: 'UPI',
        payment: {
          create: {
            method: 'UPI',
            status: 'VERIFICATION_PENDING',
            amountInPaise: awaitingAdmin.amountInPaise,
            upiUtr: '123456789012',
            utrSubmittedAt: new Date(),
          },
        },
      },
    });

    const separated = expectData<Booking>(
      'read second booking',
      await call(`/api/bookings/${awaitingAdmin.id}`, { token: customer.token }),
    );
    checkEqual('booking status reads PAYMENT_VERIFICATION', separated.status, 'PAYMENT_VERIFICATION');
    checkEqual('payment status reads VERIFICATION_PENDING', separated.payment?.status ?? null, 'VERIFICATION_PENDING');
    check(
      'the two statuses are different values on different fields',
      String(separated.status) !== String(separated.payment?.status),
      'the two fields hold the same value — they may have been collapsed',
    );

    const byBookingStatus = expectData<Paginated<Booking>>(
      'filter by booking status',
      await call('/api/bookings?status=PAYMENT_VERIFICATION', { token: customer.token }),
    );
    check(
      '?status=PAYMENT_VERIFICATION returns it',
      byBookingStatus.items.some((item) => item.id === awaitingAdmin.id),
      `got ${byBookingStatus.items.length} item(s)`,
    );

    const byPaymentStatus = expectData<Paginated<Booking>>(
      'filter by payment status',
      await call('/api/bookings?paymentStatus=VERIFICATION_PENDING', { token: customer.token }),
    );
    check(
      '?paymentStatus=VERIFICATION_PENDING returns it',
      byPaymentStatus.items.some((item) => item.id === awaitingAdmin.id),
      `got ${byPaymentStatus.items.length} item(s)`,
    );

    const paidOnly = expectData<Paginated<Booking>>(
      'filter by paid',
      await call('/api/bookings?paymentStatus=PAID', { token: customer.token }),
    );
    check(
      '?paymentStatus=PAID excludes it — the money has not arrived',
      !paidOnly.items.some((item) => item.id === awaitingAdmin.id),
      'a booking with an unverified payment came back as PAID',
    );

    const pendingPayments = expectData<Paginated<Booking>>(
      'filter expired booking by payment status',
      await call('/api/bookings?paymentStatus=PENDING', { token: customer.token }),
    );
    check(
      'the EXPIRED booking matches no payment status at all — it has no payment row',
      !pendingPayments.items.some((item) => item.id === booking.id),
      'an expired booking with no payment row was matched by a payment filter',
    );

    const expiredOnly = expectData<Paginated<Booking>>(
      'filter by expired',
      await call('/api/bookings?status=EXPIRED', { token: customer.token }),
    );
    check(
      '?status=EXPIRED returns the first booking and not the second',
      expiredOnly.items.some((item) => item.id === booking.id) &&
        !expiredOnly.items.some((item) => item.id === awaitingAdmin.id),
      'the two bookings did not separate on booking status',
    );

    /* ── The sweep respects the state machine ────────────────────────────── */

    console.log('\nThe sweep only touches bookings the customer still owns');

    await prisma.booking.update({
      where: { id: awaitingAdmin.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await call('/api/cron/expire-bookings', {
      method: 'POST',
      authorization: `Bearer ${CRON_SECRET}`,
    });

    const stillAwaiting = expectData<Booking>(
      'read second booking after sweep',
      await call(`/api/bookings/${awaitingAdmin.id}`, { token: customer.token }),
    );
    checkEqual(
      'a booking waiting on an admin is never expired, even past its deadline',
      stillAwaiting.status,
      'PAYMENT_VERIFICATION',
    );

    /* ── Cancellation and the transition table ───────────────────────────── */

    console.log('\nCancellation follows the transition table');

    const cancellable = expectData<Booking>(
      'create third booking',
      await call('/api/bookings', {
        method: 'POST',
        token: customer.token,
        body: { locationId: location.id, vehicleId: car.id, rateId: rate.id },
      }),
    );

    const foreignCancel = await call(`/api/bookings/${cancellable.id}/cancel`, {
      method: 'POST',
      token: otherCustomer.token,
      body: {},
    });
    checkEqual("another customer cannot cancel someone else's booking", foreignCancel.status, 404);

    const cancelled = expectData<Booking>(
      'cancel third booking',
      await call(`/api/bookings/${cancellable.id}/cancel`, {
        method: 'POST',
        token: customer.token,
        body: { reason: 'Changed my mind' },
      }),
    );
    checkEqual('the customer can cancel a PENDING booking', cancelled.status, 'CANCELLED');
    checkEqual('cancelling clears expiresAt', cancelled.expiresAt, null);
    check('cancelledAt was stamped', cancelled.cancelledAt !== null, `got ${cancelled.cancelledAt}`);

    const secondCancel = await call(`/api/bookings/${cancellable.id}/cancel`, {
      method: 'POST',
      token: customer.token,
      body: {},
    });
    checkEqual('cancelling twice is refused by the state machine', secondCancel.status, 409);
    checkEqual(
      'and the refusal names the reason',
      secondCancel.payload?.ok === false ? secondCancel.payload.error.code : null,
      'INVALID_STATE_TRANSITION',
    );

    const cancelVerified = await call(`/api/bookings/${awaitingAdmin.id}/cancel`, {
      method: 'POST',
      token: customer.token,
      body: {},
    });
    checkEqual(
      'a booking whose payment is awaiting verification cannot be self-cancelled',
      cancelVerified.status,
      409,
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
