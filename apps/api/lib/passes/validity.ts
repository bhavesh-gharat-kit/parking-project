/**
 * Pass validity window — `_/decisions.md` D5 point 3, computed ONCE at
 * submission and never recomputed.
 *
 * Two duration units, per `PassPlan.durationUnit` (added after Phase 19-22
 * shipped — the original "every tier snaps to calendar month" rule turned out
 * to make a true weekly/15-day plan impossible to create):
 *
 *     MONTHS: startDate = the 1st of the submission's IST calendar month
 *             endDate   = the last day of the month `durationValue - 1` months later
 *
 *     DAYS:   startDate = the submission's IST calendar day
 *             endDate   = `startDate + (durationValue - 1)` days, clipped to
 *                         the last day of `startDate`'s calendar month — a
 *                         15-Day plan bought on the 25th is valid 6 days, not
 *                         rolled into next month (chosen deliberately: a
 *                         day-based plan never crosses a month boundary,
 *                         keeping "which month was this pass active in"
 *                         unambiguous for reporting).
 *
 * "Active" vs. "expired" is purely `endDate < today`, worked out wherever
 * it's displayed (`isPassExpired` in `@parking/shared`) — there is no cron,
 * no scheduled status flip, and no recompute on confirm/approve. If an admin
 * later hand-edits these dates (D5 point 8), that manual value is simply what
 * gets compared from then on.
 *
 * ── Why month arithmetic for `MONTHS`, not day arithmetic ───────────────────
 * `startDate` is always the 1st, so a submission on the 31st never "rolls
 * over" the way adding calendar days would — the day-of-month of the
 * submission is irrelevant beyond picking which month is month zero. Adding
 * `durationValue - 1` to a (year, month) pair and then asking "how many days
 * does that resulting month have" is the only arithmetic here; nothing walks
 * day-by-day or risks landing on the 31st of a 30-day month.
 *
 * ── Why IST, and why the fixed `+05:30` offset ──────────────────────────────
 * Same reasoning as `packages/shared/src/datetime.ts`: the API's host clock
 * may be UTC, so "the submission's calendar month" has to be read in IST
 * (`istParts`) or a pass submitted after 7:30pm UTC would be filed under the
 * wrong month. The resulting `startDate`/`endDate` are built from an explicit
 * `+05:30`-suffixed ISO string (exact, since IST has no daylight saving) so
 * the stored instant reads back as IST midnight / IST end-of-day on any
 * client, not host-local midnight.
 */
import { istParts, type PassDurationUnit } from '@parking/shared';

export type PassValidityWindow = { startDate: Date; endDate: Date };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The number of days in `month` (1-12) of `year`. */
function daysInMonth(year: number, month: number): number {
  // `Date.UTC(year, month, 0)` — month is taken as a 0-indexed index into the
  // *next* calendar month, and day 0 of that is the last day of the month
  // this function was asked about.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `submittedAt` — the instant the customer submitted the application (not
 * when an admin later confirms payment, per D5 point 3).
 * `durationUnit`/`durationValue` — `PassPlan.durationUnit`/`durationValue`.
 * `MONTHS`: 1 for "runs to the end of the purchase month", 3 for a
 * quarter-style tier. `DAYS`: a literal day count, clipped to the end of the
 * purchase month.
 */
export function computePassValidity(
  submittedAt: Date,
  durationUnit: PassDurationUnit,
  durationValue: number,
): PassValidityWindow {
  const { year, month, day } = istParts(submittedAt);
  const lastDayOfSubmissionMonth = daysInMonth(year, month);

  if (durationUnit === 'DAYS') {
    const startDate = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00.000+05:30`);
    const endDay = Math.min(day + durationValue - 1, lastDayOfSubmissionMonth);
    const endDate = new Date(`${year}-${pad(month)}-${pad(endDay)}T23:59:59.999+05:30`);
    return { startDate, endDate };
  }

  const startDate = new Date(`${year}-${pad(month)}-01T00:00:00.000+05:30`);

  // Zero-indexed total months since some epoch, so adding `durationValue - 1`
  // and re-deriving (year, month) is a single modulo instead of a loop —
  // this is what makes crossing a year boundary (December + N) fall out
  // correctly with no special case.
  const totalMonthsZeroIndexed = year * 12 + (month - 1) + (durationValue - 1);
  const targetYear = Math.floor(totalMonthsZeroIndexed / 12);
  const targetMonth = (totalMonthsZeroIndexed % 12) + 1;

  const lastDay = daysInMonth(targetYear, targetMonth);
  const endDate = new Date(
    `${targetYear}-${pad(targetMonth)}-${pad(lastDay)}T23:59:59.999+05:30`,
  );

  return { startDate, endDate };
}
