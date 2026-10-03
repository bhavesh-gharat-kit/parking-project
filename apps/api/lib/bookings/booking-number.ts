/**
 * Booking number formatting — "KLY-260928-0007" (context.txt §17).
 *
 * The cuid primary key is never shown to anyone: a customer reads this number
 * out at the gate and an admin searches on it (§21), so it has to be short,
 * unambiguous over a phone line, and tell the admin at a glance which branch
 * and which day it belongs to.
 *
 *   KLY      `ParkingLocation.code` — which branch (§23, multi-location from day one)
 *   260928   the booking's date, YYMMDD, in IST
 *   0007     a 4-digit sequential counter, scoped to (location, day) — the 7th
 *            booking at this branch today. Resets to 0001 the next day, like a
 *            daily token/ticket-book number.
 *
 * The date comes from `istDateStamp` rather than the host's local time because a
 * VPS runs on UTC: a booking made at 1 a.m. in Kalyan would otherwise be filed
 * under the previous day, and an admin reconciling the day's receipts against the
 * cash box would not find it. See `packages/shared/src/datetime.ts`.
 *
 * ── Why this is a pure formatter, with no randomness or DB access ──────────
 * The actual counter comes from `nextBookingSequence` (`booking-sequence.ts`),
 * an atomic DB increment that must run inside the same transaction as the
 * booking insert it numbers (see `create.ts`). This file only turns that
 * already-unique integer into the printed string, so it stays synchronous and
 * trivially testable — unlike the previous random-suffix scheme, there is no
 * collision to retry here any more.
 */
import { istDateStamp } from '@parking/shared';

/** Matches `Booking.bookingNumber`'s VARCHAR(24) and `BookingNumberSchema`. */
const SEQUENCE_DIGITS = 4;

/**
 * `locationCode` is `ParkingLocation.code`, which the schema already
 * constrains to 8 characters, keeping the whole string inside
 * `Booking.bookingNumber`'s VARCHAR(24).
 */
export function formatBookingNumber(locationCode: string, at: Date, sequence: number): string {
  return `${locationCode.toUpperCase()}-${istDateStamp(at)}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}
