/**
 * `GET /api/bookings/:id/receipt` — the digital receipt (context.txt §17-18,
 * §503-519, Phase 08).
 *
 * A separate shape from `Booking` rather than a few extra optional fields on
 * it: a receipt only ever exists once a booking is `CONFIRMED`/`COMPLETED`,
 * and carries fields (business name/support phone, the customer's own contact
 * details) that no other booking screen has a reason to receive on every
 * fetch.
 */
import { z } from 'zod';

import {
  BookingStatusSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  VehicleTypeSchema,
  type BookingStatus,
} from './enums';

/**
 * context.txt §17 — "after the booking is approved/confirmed". `COMPLETED` is
 * reachable only from `CONFIRMED` (`BOOKING_TRANSITIONS` in `bookings.ts`), so
 * a completed booking's receipt stays available rather than disappearing the
 * moment the parking period ends.
 */
export const RECEIPT_ELIGIBLE_BOOKING_STATUSES = [
  'CONFIRMED',
  'COMPLETED',
] as const satisfies readonly BookingStatus[];

export function isReceiptEligible(status: BookingStatus): boolean {
  return (RECEIPT_ELIGIBLE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

export const ReceiptSchema = z.object({
  bookingId: z.string(),
  /** §17 — what the customer reads out at the gate, e.g. "KLY-260928-4F2B". */
  bookingNumber: z.string(),
  status: BookingStatusSchema,

  /** §17/§24 — from `AppSetting`, never baked into the APK. */
  business: z.object({
    name: z.string(),
    supportPhone: z.string().nullable(),
  }),

  location: z.object({
    name: z.string(),
    addressLine: z.string(),
    city: z.string(),
  }),

  /** Read live off `User`, not snapshotted: a receipt shows who the account
   *  belongs to today, the same way a paper receipt would if reprinted. */
  customer: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string(),
  }),

  vehicleNumber: z.string(),
  vehicleType: VehicleTypeSchema,

  /** "2 Hours", "Full Day" — the package as sold (§7), a `Booking` snapshot column. */
  rateLabel: z.string(),
  durationMinutes: z.number(),

  /** When the booking was made, for the receipt's own "Booking date" row. */
  bookingDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),

  /** Integer paise, fixed at creation by the backend (§32). */
  amountInPaise: z.number(),

  paymentMethod: PaymentMethodSchema.nullable(),
  paymentStatus: PaymentStatusSchema.nullable(),

  confirmedAt: z.string().nullable(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
