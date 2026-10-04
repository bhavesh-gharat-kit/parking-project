/**
 * Pass validity window — `_/decisions.md` D5 point 3, computed ONCE at
 * submission and never recomputed.
 *
 *     startDate = the 1st of the submission's IST calendar month
 *     endDate   = the last day of the month `validityMonths - 1` months later
 *
 * "Active" vs. "expired" is purely `endDate < today`, worked out wherever
 * it's displayed (`isPassExpired` in `@parking/shared`) — there is no cron,
 * no scheduled status flip, and no recompute on confirm/approve. If an admin
 * later hand-edits these dates (D5 point 8), that manual value is simply what
 * gets compared from then on.
 *
 * ── Why month arithmetic, not day arithmetic ────────────────────────────────
 * `startDate` is always the 1st, so a submission on the 31st never "rolls
 * over" the way adding calendar days would — the day-of-month of the
 * submission is irrelevant beyond picking which month is month zero. Adding
 * `validityMonths - 1` to a (year, month) pair and then asking "how many days
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
import { istParts } from '@parking/shared';

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
 * `validityMonths` — `PassPlan.validityMonths`, e.g. 1 for "runs to the end
 * of the purchase month", 3 for a quarter-style tier.
 */
export function computePassValidity(submittedAt: Date, validityMonths: number): PassValidityWindow {
  const { year, month } = istParts(submittedAt);

  const startDate = new Date(`${year}-${pad(month)}-01T00:00:00.000+05:30`);

  // Zero-indexed total months since some epoch, so adding `validityMonths - 1`
  // and re-deriving (year, month) is a single modulo instead of a loop —
  // this is what makes crossing a year boundary (December + N) fall out
  // correctly with no special case.
  const totalMonthsZeroIndexed = year * 12 + (month - 1) + (validityMonths - 1);
  const targetYear = Math.floor(totalMonthsZeroIndexed / 12);
  const targetMonth = (totalMonthsZeroIndexed % 12) + 1;

  const lastDay = daysInMonth(targetYear, targetMonth);
  const endDate = new Date(
    `${targetYear}-${pad(targetMonth)}-${pad(lastDay)}T23:59:59.999+05:30`,
  );

  return { startDate, endDate };
}
