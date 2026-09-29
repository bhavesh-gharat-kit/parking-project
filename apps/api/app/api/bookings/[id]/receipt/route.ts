/**
 * GET /api/bookings/:id/receipt — the digital receipt for a confirmed booking
 * (context.txt §17-18, §503-519, Phase 08).
 *
 * Its own endpoint rather than extra fields on `GET /api/bookings/:id`: the
 * business name/support phone (from `AppSetting`) and the customer's own
 * contact details (from `User`) are read here on demand rather than joined
 * onto every booking fetch every other screen makes.
 *
 * Every field returned is read straight off `Booking`'s own snapshot columns
 * or a live `AppSetting`/`User` read — never recomputed client-side (the
 * Phase 08 acceptance criterion), and only for `CONFIRMED`/`COMPLETED`
 * bookings (`isReceiptEligible`): a `PENDING` or rejected booking answers with
 * `CONFLICT`, not a receipt with blank payment fields.
 */
import type { NextRequest } from 'next/server';

import { isReceiptEligible, type Receipt } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { getBusinessName, getSupportPhone } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Ownership as a query filter, same rule as every other booking route:
  // another customer's booking id reads as "not found" and learns them nothing.
  const booking = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: {
      id: true,
      bookingNumber: true,
      status: true,
      vehicleNumber: true,
      vehicleType: true,
      rateLabel: true,
      durationMinutes: true,
      startTime: true,
      endTime: true,
      amountInPaise: true,
      paymentMethod: true,
      confirmedAt: true,
      createdAt: true,
      location: { select: { name: true, addressLine: true, city: true } },
      user: { select: { name: true, phone: true, email: true } },
      payment: { select: { status: true } },
    },
  });

  if (!booking) return fail('NOT_FOUND', 'That booking could not be found.');

  if (!isReceiptEligible(booking.status)) {
    return fail('CONFLICT', 'A receipt is available once this booking has been confirmed.');
  }

  const [businessName, supportPhone] = await Promise.all([getBusinessName(), getSupportPhone()]);

  const receipt: Receipt = {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,

    business: { name: businessName, supportPhone },
    location: {
      name: booking.location.name,
      addressLine: booking.location.addressLine,
      city: booking.location.city,
    },
    customer: {
      name: booking.user.name,
      phone: booking.user.phone,
      email: booking.user.email,
    },

    vehicleNumber: booking.vehicleNumber,
    vehicleType: booking.vehicleType,

    rateLabel: booking.rateLabel,
    durationMinutes: booking.durationMinutes,

    bookingDate: booking.createdAt.toISOString(),
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),

    amountInPaise: booking.amountInPaise,

    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.payment?.status ?? null,

    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
  };

  return ok(receipt, { headers: { 'Cache-Control': 'no-store' } });
}
