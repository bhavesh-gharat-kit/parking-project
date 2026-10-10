/**
 * Canonical enum values shared by the API and the mobile app.
 *
 * These are the SINGLE source of truth for enum *values*. `prisma/schema.prisma`
 * declares the same value sets for the database, and
 * `apps/api/lib/enum-parity.ts` contains a compile-time assertion that the two
 * lists never drift. Adding a value therefore means editing exactly two files,
 * and forgetting the second one is a type error rather than a runtime surprise.
 *
 * This module is imported by React Native, so it must stay free of Node-only
 * and Prisma imports (see README "Shared typing strategy").
 */
import { z } from 'zod';

/* ────────────────────────────── Identity ────────────────────────────── */

/** context.txt §4, §19 — assigned by the backend, never selectable by a client. */
export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const UserRoleSchema = z.enum(USER_ROLES);

/* ────────────────────────────── Vehicles ────────────────────────────── */

/**
 * context.txt §5 — "Bike, Car, Other, if required". Kept as an enum rather than
 * a lookup table: rates and bookings key off it, and the business has no need to
 * attach data to a vehicle type. Adding a type is one migration plus one line
 * here, with no change to rate or booking code.
 */
export const VEHICLE_TYPES = ['BIKE', 'CAR', 'OTHER'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES);

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BIKE: 'Bike',
  CAR: 'Car',
  OTHER: 'Other',
};

/* ───────────────────────── Booking status (§14) ──────────────────────── */

/**
 * context.txt §14. Deliberately SEPARATE from `PaymentStatus` — a booking's
 * lifecycle state and the money's state are different concerns and must never be
 * collapsed into one field (context.txt §32).
 *
 * Phase 05 owns the legal transition table; this list is only the value set.
 */
export const BOOKING_STATUSES = [
  /** Created, payment method not chosen yet. */
  'PENDING',
  /** UPI chosen, waiting for the customer to pay and submit a UTR. */
  'PENDING_PAYMENT',
  /** UTR submitted, admin has not verified the UPI transaction yet (§11). */
  'PAYMENT_VERIFICATION',
  /** Cash-at-parking chosen, waiting for the admin to receive cash (§12). */
  'PENDING_APPROVAL',
  /** Admin approved; the receipt becomes available (§17). */
  'CONFIRMED',
  /** Admin rejected the payment/booking. */
  'REJECTED',
  /** Customer withdrew the booking. */
  'CANCELLED',
  /** Not carried through to a paid/approved state in time (§15). */
  'EXPIRED',
  /** Parking period finished. */
  'COMPLETED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BookingStatusSchema = z.enum(BOOKING_STATUSES);

/** Customer-facing wording. Phase 06 relies on UPI vs cash reading differently. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  PENDING_PAYMENT: 'Awaiting Payment',
  PAYMENT_VERIFICATION: 'Payment Verification',
  PENDING_APPROVAL: 'Pending Approval',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_BOOKING_STATUSES = [
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
] as const satisfies readonly BookingStatus[];

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return (TERMINAL_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/* ───────────────────────── Payment status (§14) ──────────────────────── */

/** context.txt §14. Separate concern from `BookingStatus` — see above. */
export const PAYMENT_STATUSES = [
  /** No money moved yet (cash booking, or UPI QR shown but no UTR). */
  'PENDING',
  /** Customer supplied a UTR; it is a claim, not proof of payment (§32). */
  'VERIFICATION_PENDING',
  /** Admin confirmed the money arrived. Only this state counts as revenue (§27). */
  'PAID',
  /** Reserved for the Phase-13 payment gateway (§13). */
  'FAILED',
  /** Admin verified and the money was not there. */
  'REJECTED',
  /** Money returned. */
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  VERIFICATION_PENDING: 'Verification Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
};

/** context.txt §27 — revenue counts only money that actually arrived. */
export const REVENUE_PAYMENT_STATUSES = ['PAID'] as const satisfies readonly PaymentStatus[];

/* ───────────────────────── Payment method (§10) ──────────────────────── */

/**
 * context.txt §10-13. A future Razorpay/gateway path adds a value here plus the
 * `gateway*` columns already reserved on `Payment` — no restructuring needed.
 */
export const PAYMENT_METHODS = ['UPI', 'CASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  UPI: 'UPI',
  CASH: 'Cash at Parking',
};

/* ───────────────────── Push notifications (decisions D4) ─────────────── */

export const DEVICE_PLATFORMS = ['ANDROID', 'IOS', 'WEB'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
export const DevicePlatformSchema = z.enum(DEVICE_PLATFORMS);

/* ─────────────────────────── Complaints ─────────────────────────── */

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const ComplaintStatusSchema = z.enum(COMPLAINT_STATUSES);

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};
