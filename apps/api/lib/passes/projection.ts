/**
 * The one shape a pass application leaves this API in, shared by every route
 * under `app/api/passes/**` (and by Phase 21's admin queue). Mirrors
 * `lib/bookings/projection.ts` exactly.
 */
import type { Prisma } from '@/generated/prisma/client';
import type { AdminPass, AdminPassStatusEvent, PassBooking, PassPayment } from '@parking/shared';

/**
 * Only two relations the DTO needs. Everything else the customer sees —
 * vehicle number, plan label, amount, application fields — is a snapshot
 * column on `PassBooking` itself (D5 point 2's "never re-read from the live
 * `PassPlan`" rule), so it is read without a join.
 */
export const PASS_RELATIONS = {
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
      utrScreenshotUrl: true,
      paidAt: true,
    },
  },
} as const satisfies Prisma.PassBookingInclude;

export type PassBookingWithRelations = Prisma.PassBookingGetPayload<{
  include: typeof PASS_RELATIONS;
}>;

function toPassPayment(payment: PassBookingWithRelations['payment']): PassPayment | null {
  // Honest "not started yet" before the customer picks a payment method —
  // same reasoning as `toBookingPayment`.
  if (!payment) return null;

  return {
    method: payment.method,
    status: payment.status,
    amountInPaise: payment.amountInPaise,
    upiPayeeVpa: payment.upiPayeeVpa,
    upiUtr: payment.upiUtr,
    utrScreenshotUrl: payment.utrScreenshotUrl,
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

/** Everything the pass detail/list screens have to show (D5). */
export function toPassBooking(row: PassBookingWithRelations): PassBooking {
  return {
    id: row.id,
    passNumber: row.passNumber,

    status: row.status,
    paymentMethod: row.paymentMethod,
    payment: toPassPayment(row.payment),

    location: {
      id: row.location.id,
      name: row.location.name,
      addressLine: row.location.addressLine,
      city: row.location.city,
      upiQrImageUrl: row.location.upiQrImageUrl,
    },

    planLabel: row.planLabel,
    vehicleType: row.vehicleType,
    shiftType: row.shiftType,
    durationUnit: row.durationUnit,
    durationValue: row.durationValue,
    amountInPaise: row.amountInPaise,

    vehicleNumber: row.vehicleNumber,
    vehicleCategory: row.vehicleCategory,
    vehicleCategoryOther: row.vehicleCategoryOther,
    mobileNumber: row.mobileNumber,
    address: row.address,

    occupationCategory: row.occupationCategory,
    occupationOther: row.occupationOther,
    holidayOffDay: row.holidayOffDay,
    holidayOffDayOther: row.holidayOffDayOther,
    helmet: row.helmet,
    locker: row.locker,
    airCheck: row.airCheck,
    rickshawParking: row.rickshawParking,
    renewalReference: row.renewalReference,
    expectedParkingDays: row.expectedParkingDays,
    entryTime: row.entryTime,
    exitTime: row.exitTime,

    specification: row.specification,
    entrySide: row.entrySide,

    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),

    expiresAt: row.expiresAt?.toISOString() ?? null,

    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,

    reviewNote: row.reviewNote,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Phase 21's admin queue/detail screens need two relations the customer side
 * never does: who the application belongs to (search/display, same reasoning
 * as `ADMIN_BOOKING_RELATIONS`) and the full `PassStatusEvent` timeline (D5
 * point 8's "visible... without a DB query"), newest first.
 */
export const PASS_ADMIN_RELATIONS = {
  ...PASS_RELATIONS,
  user: { select: { id: true, name: true, email: true, phone: true } },
  statusEvents: {
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, email: true } } },
  },
} as const satisfies Prisma.PassBookingInclude;

export type AdminPassBookingWithRelations = Prisma.PassBookingGetPayload<{
  include: typeof PASS_ADMIN_RELATIONS;
}>;

function toAdminPassStatusEvent(
  row: AdminPassBookingWithRelations['statusEvents'][number],
): AdminPassStatusEvent {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
    actorRole: row.actorRole,
    note: row.note,
    changedFields: (row.changedFields as unknown as AdminPassStatusEvent['changedFields']) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Everything `toPassBooking` shows, plus who it belongs to and its full
 *  edit/status history (D5 point 8). */
export function toAdminPassBooking(row: AdminPassBookingWithRelations): AdminPass {
  return {
    ...toPassBooking(row),
    customer: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
    },
    statusEvents: row.statusEvents.map(toAdminPassStatusEvent),
  };
}
