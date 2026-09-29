/**
 * The one shape a booking leaves this API in, shared by every route under
 * `app/api/bookings/**` (and by Phase 07's admin queue and Phase 08's receipt).
 *
 * `BOOKING_RELATIONS` is exported alongside it so a query and its projection
 * can never disagree about what was selected: a handler that forgets the
 * `location` include gets a type error here rather than `undefined.name` at
 * request time.
 */
import type { Prisma } from '@/generated/prisma/client';
import type { Booking, BookingPayment } from '@parking/shared';

/**
 * The only two relations the DTO needs.
 *
 * Everything else the customer sees — vehicle number, vehicle type, package
 * label, duration, amount — is a snapshot column on `Booking` itself, so it is
 * read without a join and cannot be rewritten by an admin editing a rate (§24,
 * and the snapshot block in `schema.prisma`).
 */
export const BOOKING_RELATIONS = {
  location: {
    select: { id: true, name: true, addressLine: true, city: true, upiQrImageUrl: true },
  },
  payment: {
    select: {
      method: true,
      status: true,
      amountInPaise: true,
      upiPayeeVpa: true,
      upiUtr: true,
      paidAt: true,
    },
  },
} as const satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof BOOKING_RELATIONS;
}>;

function toBookingPayment(
  payment: BookingWithRelations['payment'],
): BookingPayment | null {
  // §14/§32 — null is the honest answer before Phase 06's method selection:
  // `Payment.method` is not nullable, so there is no row to report yet, and the
  // booking's own `status` is doing its own separate job in the meantime.
  if (!payment) return null;

  return {
    method: payment.method,
    status: payment.status,
    amountInPaise: payment.amountInPaise,
    upiPayeeVpa: payment.upiPayeeVpa,
    upiUtr: payment.upiUtr,
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

/** context.txt §248-258 — everything the booking summary screen has to show. */
export function toBooking(row: BookingWithRelations): Booking {
  return {
    id: row.id,
    bookingNumber: row.bookingNumber,

    status: row.status,
    paymentMethod: row.paymentMethod,
    payment: toBookingPayment(row.payment),

    location: {
      id: row.location.id,
      name: row.location.name,
      addressLine: row.location.addressLine,
      city: row.location.city,
      upiQrImageUrl: row.location.upiQrImageUrl,
    },

    vehicleId: row.vehicleId,
    vehicleNumber: row.vehicleNumber,
    vehicleType: row.vehicleType,

    rateId: row.rateId,
    rateLabel: row.rateLabel,
    durationMinutes: row.durationMinutes,

    amountInPaise: row.amountInPaise,

    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),

    expiresAt: row.expiresAt?.toISOString() ?? null,

    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiredAt: row.expiredAt?.toISOString() ?? null,

    reviewNote: row.reviewNote,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
