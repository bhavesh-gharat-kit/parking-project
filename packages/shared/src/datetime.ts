/**
 * Date and time formatting for a business that operates in one timezone.
 *
 * Every timestamp this system shows a human — a booking's start and end time on
 * the summary screen, the date in a booking number, the date on a receipt (§17)
 * — is India Standard Time, whatever the machine doing the formatting thinks its
 * own timezone is. Two concrete reasons:
 *
 *  - The API runs on a VPS, which defaults to UTC. A booking made at 1 a.m. in
 *    Kalyan would otherwise be dated the previous day on its own receipt.
 *  - A customer's phone can be on any timezone (a traveller, or simply a wrong
 *    setting). The parking is in India either way.
 *
 * ── Why the arithmetic is done by hand and not with `Intl` ─────────────────
 * IST is UTC+5:30 all year — India observes no daylight saving — so shifting by
 * a fixed 330 minutes and reading the UTC fields is not an approximation, it is
 * exact. Doing it this way means the API (Node, full ICU) and the app (Hermes,
 * whose `Intl` timezone support depends on the Android build) produce
 * byte-identical strings, which matters for Phase 08: a receipt shown in the app
 * and the same receipt rendered server-side must not disagree about the time.
 */

/** IST is UTC+05:30, with no daylight saving. */
export const IST_OFFSET_MINUTES = 330;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

type IstParts = {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  /** 0-23. */
  hours: number;
  minutes: number;
};

/**
 * The IST wall-clock fields of an instant.
 *
 * The shift puts IST local time into the Date's UTC fields, so `getUTC*` reads
 * out the numbers a clock in Kalyan would show. Reading `getHours()` instead
 * would give the *host's* local time, which is the bug this module exists to
 * avoid.
 */
export function istParts(value: Date | string): IstParts {
  const date = typeof value === 'string' ? new Date(value) : value;
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** `2026-09-28T19:40:00Z` → `260928`. The date segment of a booking number (§17). */
export function istDateStamp(value: Date | string): string {
  const { year, month, day } = istParts(value);
  return `${String(year).slice(2)}${pad(month)}${pad(day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `7:40 pm` — the 12-hour clock an Indian parking receipt is written in. */
export function formatIstTime(value: Date | string): string {
  const { hours, minutes } = istParts(value);
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(minutes)} ${suffix}`;
}

/** `28 Sep 2026` */
export function formatIstDate(value: Date | string): string {
  const { year, month, day } = istParts(value);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** `28 Sep 2026, 7:40 pm` */
export function formatIstDateTime(value: Date | string): string {
  return `${formatIstDate(value)}, ${formatIstTime(value)}`;
}

/**
 * `28 Sep 2026, 7:40 pm – 9:40 pm`, collapsing the date when a booking starts
 * and ends on the same IST day — which, for a package of a day or less, it
 * almost always does.
 */
export function formatIstRange(start: Date | string, end: Date | string): string {
  const startDate = formatIstDate(start);
  const endDate = formatIstDate(end);

  if (startDate === endDate) {
    return `${startDate}, ${formatIstTime(start)} – ${formatIstTime(end)}`;
  }

  return `${formatIstDateTime(start)} – ${formatIstDateTime(end)}`;
}

/**
 * The IST calendar day `"2026-09-28"` as its `[start, end]` instants, inclusive.
 *
 * Turns an admin's date-range filter (§21, Phase 07) into UTC instants Prisma can
 * compare a column against — the fixed `+05:30` offset is parsed directly by
 * `Date`, so this needs no more arithmetic than `istParts` above does.
 */
export function istDayBounds(dateStamp: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStamp}T00:00:00.000+05:30`),
    end: new Date(`${dateStamp}T23:59:59.999+05:30`),
  };
}

/**
 * `9:58` — a countdown for the §15 expiry window, floored at zero.
 *
 * Floored rather than allowed to go negative because the sweep runs on a timer:
 * between the deadline passing and the next sweep, the honest thing to show is
 * `0:00` and a status that has not changed yet, not a negative clock.
 */
export function formatCountdown(millisecondsRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(millisecondsRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${pad(seconds)}`;
}
