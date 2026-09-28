/**
 * Booking numbers — "KLY-260928-4F2B" (context.txt §17).
 *
 * The cuid primary key is never shown to anyone: a customer reads this number
 * out at the gate and an admin searches on it (§21), so it has to be short,
 * unambiguous over a phone line, and tell the admin at a glance which branch and
 * which day it belongs to.
 *
 *   KLY      `ParkingLocation.code` — which branch (§23, multi-location from day one)
 *   260928   the booking's date, YYMMDD, in IST
 *   4F2B     4 random characters, so two bookings on one day at one branch differ
 *
 * The date comes from `istDateStamp` rather than the host's local time because a
 * VPS runs on UTC: a booking made at 1 a.m. in Kalyan would otherwise be filed
 * under the previous day, and an admin reconciling the day's receipts against the
 * cash box would not find it. See `packages/shared/src/datetime.ts`.
 *
 * The random suffix comes from a crypto RNG over an alphabet with I, O, 0 and 1
 * removed — the four characters a customer reads back wrongly over a phone. 32^4
 * is ~1M combinations per branch per day, and `Booking.bookingNumber` is
 * `@unique`, so a collision is a retry (see `lib/bookings/create.ts`), never a
 * duplicate.
 */
import { randomInt } from 'node:crypto';

import { istDateStamp } from '@parking/shared';

/** Crockford-style: no I, O, 0 or 1. Matches `BookingNumberSchema`'s [A-Z0-9]. */
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 4;

function randomSuffix(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/**
 * One candidate booking number. `locationCode` is `ParkingLocation.code`, which
 * the schema already constrains to 8 characters, keeping the whole string inside
 * `Booking.bookingNumber`'s VARCHAR(24).
 */
export function buildBookingNumber(locationCode: string, at: Date): string {
  return `${locationCode.toUpperCase()}-${istDateStamp(at)}-${randomSuffix()}`;
}
