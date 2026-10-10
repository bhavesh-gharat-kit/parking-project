/**
 * Money handling.
 *
 * Every rupee amount in this system is stored and transported as an INTEGER
 * number of paise (₹70.00 → 7000), never as a float or a decimal string.
 *
 * Why paise:
 *  - No binary floating-point rounding error, ever.
 *  - Survives JSON as a plain `number` (a Prisma `Decimal` serialises to a string
 *    and needs decimal.js on the client — extra weight in a React Native bundle).
 *  - Matches what an Indian payment gateway expects: Razorpay's `amount` field is
 *    already paise, so the Phase-13 integration (context.txt §13) needs no
 *    conversion layer.
 *
 * Every such field is named `...InPaise` so a rupee value can never be assigned
 * to it by accident.
 */

export const PAISE_PER_RUPEE = 100;

/** ₹70.5 → 7050. Rounds to the nearest paisa. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** 7050 → 70.5. Only for display/export — never store the result. */
export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * 7000 → "₹70", 7050 → "₹70.50".
 * Whole-rupee amounts drop the decimals, which is how Indian parking prices are
 * written on a board.
 */
export function formatInr(paise: number, options?: { withSymbol?: boolean }): string {
  const withSymbol = options?.withSymbol ?? true;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;

  // Indian digit grouping (2,2,3): 1234567 → 12,34,567
  const grouped = rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const body = remainder === 0 ? grouped : `${grouped}.${String(remainder).padStart(2, '0')}`;

  return `${negative ? '-' : ''}${withSymbol ? '₹' : ''}${body}`;
}

/** "2 Hours" style label from a duration. Used for rate labels and receipts. */
export function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Full Day' : `${days} Days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 Hour' : `${hours} Hours`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} Hr ${mins} Min` : `${mins} Min`;
}
