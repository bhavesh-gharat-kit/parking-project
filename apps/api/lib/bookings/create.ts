/**
 * Booking creation (context.txt §9, §15, §32 · decisions.md D2).
 *
 * ── The one rule this file exists to enforce ────────────────────────────────
 * "The customer should never control the final payable amount" (§32, §187-189).
 * The caller supplies three IDs. Everything that decides what the customer owes
 * and for how long is read here, server-side, from the `ParkingRate` row:
 *
 *     amountInPaise ← rate.priceInPaise
 *     startTime     ← now
 *     endTime       ← startTime + rate.durationMinutes
 *     expiresAt     ← now + booking.expiryMinutes  (§15)
 *
 * `BookingCreateRequestSchema` has no amount field to begin with, so a tampered
 * `amountInPaise` is dropped by Zod before this function is called and could not
 * be honoured here even if it were passed.
 *
 * ── Why the rate is re-validated rather than trusted ───────────────────────
 * The `rateId` arrived from a list the app fetched minutes ago, and an admin can
 * retire or reprice a rate at any time without an app release (§24). So the row
 * is re-read at creation time and checked to be active, to belong to the
 * location being booked, and to match the vehicle's own type — a "Bike · 2 Hours"
 * rate cannot be used to park a car cheaply.
 *
 * ── Why the price is then copied onto the booking ──────────────────────────
 * Per `schema.prisma`'s snapshot block: the booking keeps its own
 * `amountInPaise`, `rateLabel`, `durationMinutes`, `vehicleNumber` and
 * `vehicleType`, so tomorrow's price change cannot rewrite today's receipt
 * (§17) or last week's revenue report (§27).
 *
 * Per D2 there is no slot inventory to reserve: a booking is
 * {location, vehicle, package, start, end}. Nothing is held that could be
 * double-booked, which is also why expiry (§15) has nothing to release beyond
 * the booking's own state.
 */
import { istDateStamp } from '@parking/shared';
import type { BookingCreateRequest } from '@parking/shared';

import { prisma } from '@/lib/db';
import { getBookingExpiryMinutes } from '@/lib/settings';
import { nextBookingSequence } from './booking-sequence';
import { formatBookingNumber } from './booking-number';
import { BOOKING_RELATIONS, type BookingWithRelations } from './projection';

const MS_PER_MINUTE = 60_000;

export type CreateBookingInput = BookingCreateRequest & { userId: string };

export type CreateBookingResult =
  | { ok: true; booking: BookingWithRelations }
  | {
      ok: false;
      /** Which id the customer has to change. Maps to a field error in the app. */
      reason: 'VEHICLE_NOT_FOUND' | 'LOCATION_NOT_FOUND' | 'RATE_NOT_FOUND' | 'RATE_VEHICLE_MISMATCH';
    };

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const { userId, locationId, vehicleId, rateId } = input;

  // Ownership is a query filter, not a comparison after the fact — the same rule
  // as `findOwnVehicle`: a vehicle belonging to someone else is never even held
  // in a variable here, and reads as "no such vehicle" rather than a 403 that
  // would confirm the id exists.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId, isActive: true },
    select: { id: true, number: true, type: true },
  });
  if (!vehicle) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  // `isActive` here too: a branch the admin has closed (§23) must stop taking
  // bookings immediately, not from the next app release.
  const location = await prisma.parkingLocation.findFirst({
    where: { id: locationId, isActive: true },
    select: { id: true, code: true },
  });
  if (!location) return { ok: false, reason: 'LOCATION_NOT_FOUND' };

  const rate = await prisma.parkingRate.findFirst({
    where: { id: rateId, locationId: location.id, isActive: true },
    select: { id: true, vehicleType: true, label: true, durationMinutes: true, priceInPaise: true },
  });
  if (!rate) return { ok: false, reason: 'RATE_NOT_FOUND' };

  if (rate.vehicleType !== vehicle.type) {
    return { ok: false, reason: 'RATE_VEHICLE_MISMATCH' };
  }

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + rate.durationMinutes * MS_PER_MINUTE);

  const expiryMinutes = await getBookingExpiryMinutes();
  const expiresAt = new Date(startTime.getTime() + expiryMinutes * MS_PER_MINUTE);

  // The sequence increment and the booking insert share one transaction (see
  // `booking-sequence.ts`): if anything below fails, the counter rolls back
  // too, so a failed attempt never burns a number out of the day's sequence.
  const booking = await prisma.$transaction(async (tx) => {
    const dateStamp = istDateStamp(startTime);
    const sequence = await nextBookingSequence(tx, location.id, dateStamp);
    const bookingNumber = formatBookingNumber(location.code, startTime, sequence);

    return tx.booking.create({
      data: {
        bookingNumber,

        userId,
        locationId: location.id,
        vehicleId: vehicle.id,
        rateId: rate.id,

        // ── snapshot (schema.prisma) ──
        vehicleNumber: vehicle.number,
        vehicleType: vehicle.type,
        rateLabel: rate.label,
        durationMinutes: rate.durationMinutes,
        amountInPaise: rate.priceInPaise,

        startTime,
        endTime,

        // §14 — created in PENDING. The payment method, and the status that
        // follows from it (PENDING_PAYMENT for UPI, PENDING_APPROVAL for cash),
        // are Phase 06's to set through `transitionBooking`.
        status: 'PENDING',
        paymentMethod: null,
        expiresAt,

        // §21 — the audit trail starts at creation, so every booking's history
        // is complete from its first state rather than from its second. Nested
        // so it shares the insert's transaction.
        statusEvents: {
          create: {
            fromStatus: null,
            toStatus: 'PENDING',
            actorId: userId,
            actorRole: 'USER',
            note: 'Booking created',
          },
        },
      },
      include: BOOKING_RELATIONS,
    });
  });

  return { ok: true, booking };
}
