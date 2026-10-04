/**
 * Pass number formatting — "KLY-PASS-2610-0007" (schema.prisma's comment on
 * `PassBooking.passNumber`).
 *
 *   KLY   `ParkingLocation.code` — which branch
 *   PASS  literal, distinguishing it at a glance from a daily `bookingNumber`
 *         ("KLY-260928-0007") printed on the same counter
 *   2610  the pass's submission month, YYMM, in IST
 *   0007  a 4-digit sequential counter, scoped to (location, month) — the 7th
 *         pass sold at this branch this calendar month. Resets to 0001 next
 *         month, since a pass is sold per month, not per day (D5).
 *
 * Pure formatter, no DB access — same split as `lib/bookings/booking-number.ts`:
 * the actual counter comes from `nextPassSequence` (`pass-sequence.ts`), an
 * atomic DB increment that must run inside the same transaction as the
 * `PassBooking` insert it numbers (see `create.ts`).
 */
import { istParts } from '@parking/shared';

/** Matches `PassBooking.passNumber`'s VARCHAR(28). */
const SEQUENCE_DIGITS = 4;

/** `2026-10-28T19:40:00Z` → `2610`. The YYMM grouping key for `PassMonthlySequence`. */
export function istYearMonth(value: Date | string): string {
  const { year, month } = istParts(value);
  return `${String(year).slice(2)}${String(month).padStart(2, '0')}`;
}

/**
 * `locationCode` is `ParkingLocation.code`, already constrained to 8
 * characters, keeping the whole string inside `PassBooking.passNumber`'s
 * VARCHAR(28).
 */
export function formatPassNumber(locationCode: string, at: Date, sequence: number): string {
  return `${locationCode.toUpperCase()}-PASS-${istYearMonth(at)}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}
