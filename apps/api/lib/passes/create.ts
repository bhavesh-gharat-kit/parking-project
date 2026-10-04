/**
 * Pass application creation (`_/decisions.md` D5, Phase 20).
 *
 * ── The one rule this file exists to enforce ────────────────────────────────
 * Same lineage as `lib/bookings/create.ts`'s §32 rule: the customer never
 * controls the payable amount or the validity window. The caller supplies
 * free-text application fields plus two IDs; everything that decides what the
 * customer owes and for how long is read here, server-side, from the live
 * `PassPlan` row:
 *
 *     amountInPaise          ← plan.priceInPaise
 *     startDate / endDate    ← computePassValidity(now, plan.validityMonths)
 *     expiresAt              ← now + pass.expiryMinutes  (D5 point 9)
 *
 * `PassCreateRequestSchema` has no amount, validity, or date field to begin
 * with, so a tampered value in the request body is dropped by Zod before this
 * function is called and could not be honoured here even if it were passed.
 *
 * ── Why the plan is re-validated rather than trusted ───────────────────────
 * The `passPlanId` arrived from a list the client fetched minutes ago, and an
 * admin can retire or reprice a plan at any time (D5 point 2). So the row is
 * re-read at creation time and checked to be active, to belong to the
 * location being applied for, and to match the vehicle type the customer
 * declared — a "Bike" plan cannot be used to buy a car pass cheaply.
 *
 * ── Why the price/label/validity are then copied onto the pass ────────────
 * Per the snapshot block on `PassBooking`: a plan's price or label changing
 * later must not rewrite an already-submitted application's own record
 * (D5 point 2).
 *
 * `vehicleNumber`/`mobileNumber`/`address` are free text end to end (D5
 * point 1) — `PassCreateRequestSchema` already normalises and validates them
 * server-side regardless of what a client-side form checked, so this
 * function receives already-clean values.
 */
import type { PassCreateRequestParsed } from '@parking/shared';

import { prisma } from '@/lib/db';
import { getPassExpiryMinutes } from '@/lib/settings';
import { nextPassSequence } from './pass-sequence';
import { formatPassNumber, istYearMonth } from './pass-number';
import { computePassValidity } from './validity';
import { PASS_RELATIONS, type PassBookingWithRelations } from './projection';

const MS_PER_MINUTE = 60_000;

export type CreatePassInput = PassCreateRequestParsed & { userId: string };

export type CreatePassResult =
  | { ok: true; passBooking: PassBookingWithRelations }
  | {
      ok: false;
      /** Which id the customer has to change. Maps to a field error in the app. */
      reason: 'LOCATION_NOT_FOUND' | 'PLAN_NOT_FOUND' | 'PLAN_VEHICLE_MISMATCH';
    };

export async function createPassBooking(input: CreatePassInput): Promise<CreatePassResult> {
  const {
    userId,
    locationId,
    passPlanId,
    vehicleNumber,
    vehicleType,
    vehicleCategory,
    mobileNumber,
    address,
    occupationCategory,
    holidayOffDay,
    helmet,
    locker,
    airCheck,
    rickshawParking,
    renewalReference,
  } = input;

  // `isActive` here too: a branch the admin has closed must stop taking pass
  // applications immediately, not from the next release.
  const location = await prisma.parkingLocation.findFirst({
    where: { id: locationId, isActive: true },
    select: { id: true, code: true },
  });
  if (!location) return { ok: false, reason: 'LOCATION_NOT_FOUND' };

  const plan = await prisma.passPlan.findFirst({
    where: { id: passPlanId, locationId: location.id, isActive: true },
    select: {
      id: true,
      vehicleType: true,
      shiftType: true,
      label: true,
      validityMonths: true,
      priceInPaise: true,
    },
  });
  if (!plan) return { ok: false, reason: 'PLAN_NOT_FOUND' };

  if (plan.vehicleType !== vehicleType) {
    return { ok: false, reason: 'PLAN_VEHICLE_MISMATCH' };
  }

  const submittedAt = new Date();
  const { startDate, endDate } = computePassValidity(submittedAt, plan.validityMonths);

  const expiryMinutes = await getPassExpiryMinutes();
  const expiresAt = new Date(submittedAt.getTime() + expiryMinutes * MS_PER_MINUTE);

  // The sequence increment and the pass insert share one transaction (see
  // `pass-sequence.ts`): if anything below fails, the counter rolls back too,
  // so a failed attempt never burns a number out of the month's sequence.
  const passBooking = await prisma.$transaction(async (tx) => {
    const yearMonth = istYearMonth(submittedAt);
    const sequence = await nextPassSequence(tx, location.id, yearMonth);
    const passNumber = formatPassNumber(location.code, submittedAt, sequence);

    return tx.passBooking.create({
      data: {
        passNumber,

        userId,
        locationId: location.id,
        passPlanId: plan.id,

        // ── snapshot ──
        planLabel: plan.label,
        vehicleType: plan.vehicleType,
        shiftType: plan.shiftType,
        validityMonths: plan.validityMonths,
        amountInPaise: plan.priceInPaise,

        // ── free-text application fields (D5 point 1) ──
        vehicleNumber,
        mobileNumber,
        address,
        vehicleCategory,

        // ── informational only (D5 point 5) ──
        occupationCategory: occupationCategory ?? null,
        holidayOffDay: holidayOffDay ?? null,
        helmet,
        locker,
        airCheck,
        rickshawParking,
        renewalReference: renewalReference ?? null,

        startDate,
        endDate,

        status: 'PENDING',
        paymentMethod: null,
        expiresAt,

        statusEvents: {
          create: {
            fromStatus: null,
            toStatus: 'PENDING',
            actorId: userId,
            actorRole: 'USER',
            note: 'Pass application created',
          },
        },
      },
      include: PASS_RELATIONS,
    });
  });

  return { ok: true, passBooking };
}
