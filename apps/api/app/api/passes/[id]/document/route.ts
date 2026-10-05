/**
 * GET /api/passes/:id/document — the data page 1 of the printable pass needs
 * (`_/decisions.md` D5, Phase 22). Mirrors
 * `app/api/bookings/[id]/receipt/route.ts`'s shape/auth rules, with one
 * difference: an admin may reprint any customer's pass (Phase 22 deliverable
 * 5 — "a customer loses theirs and asks the office for a reprint"), so the
 * ownership filter is skipped for `ADMIN` callers instead of always scoping
 * to `userId`.
 *
 * Only `CONFIRMED` has a complete document — `specification`/`entrySide` are
 * still `null` before an admin approves (D5 point 6), so anything earlier
 * answers `CONFLICT` rather than a document with blank admin fields.
 */
import type { NextRequest } from 'next/server';

import { isPassDocumentEligible, type PassDocument } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Same "not found, not forbidden" rule as every other pass route: another
  // customer's pass id reads as 404 and learns the caller nothing. An admin
  // is the one caller allowed past the ownership filter.
  const where = auth.actor.role === 'ADMIN' ? { id } : { id, userId: auth.actor.userId };

  const passBooking = await prisma.passBooking.findFirst({
    where,
    select: {
      id: true,
      passNumber: true,
      status: true,
      createdAt: true,
      vehicleNumber: true,
      vehicleCategory: true,
      shiftType: true,
      mobileNumber: true,
      address: true,
      specification: true,
      entrySide: true,
      occupationCategory: true,
      occupationOther: true,
      holidayOffDay: true,
      holidayOffDayOther: true,
      helmet: true,
      locker: true,
      airCheck: true,
      rickshawParking: true,
      renewalReference: true,
      expectedParkingDays: true,
      entryTime: true,
      exitTime: true,
      startDate: true,
      endDate: true,
      paymentMethod: true,
      payment: { select: { upiUtr: true } },
    },
  });

  if (!passBooking) return fail('NOT_FOUND', 'That pass application could not be found.');

  if (!isPassDocumentEligible(passBooking.status)) {
    return fail('CONFLICT', 'The pass document is available once this pass has been confirmed.');
  }

  const document: PassDocument = {
    passId: passBooking.id,
    passNumber: passBooking.passNumber,
    status: passBooking.status,
    createdAt: passBooking.createdAt.toISOString(),

    vehicleNumber: passBooking.vehicleNumber,
    vehicleCategory: passBooking.vehicleCategory,
    shiftType: passBooking.shiftType,

    mobileNumber: passBooking.mobileNumber,
    address: passBooking.address,

    specification: passBooking.specification,
    entrySide: passBooking.entrySide,

    occupationCategory: passBooking.occupationCategory,
    occupationOther: passBooking.occupationOther,
    holidayOffDay: passBooking.holidayOffDay,
    holidayOffDayOther: passBooking.holidayOffDayOther,
    helmet: passBooking.helmet,
    locker: passBooking.locker,
    airCheck: passBooking.airCheck,
    rickshawParking: passBooking.rickshawParking,
    renewalReference: passBooking.renewalReference,
    expectedParkingDays: passBooking.expectedParkingDays,
    entryTime: passBooking.entryTime,
    exitTime: passBooking.exitTime,

    startDate: passBooking.startDate.toISOString(),
    endDate: passBooking.endDate.toISOString(),

    paymentMethod: passBooking.paymentMethod,
    // D5 point 7 — blank for cash, never a placeholder.
    upiUtr: passBooking.payment?.upiUtr ?? null,
  };

  return ok(document, { headers: { 'Cache-Control': 'no-store' } });
}
