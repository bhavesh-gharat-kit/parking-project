/**
 * Atomic per-(location, month) counter backing the sequential pass number
 * (D5, `pass-number.ts`). Identical idiom to `lib/bookings/booking-sequence.ts`
 * — see that file's header for why `INSERT ... ON DUPLICATE KEY UPDATE ...
 * LAST_INSERT_ID(expr)` is race-free without an explicit `SELECT ... FOR
 * UPDATE`, and why this must run inside the same transaction as the
 * `PassBooking` insert it numbers.
 */
import type { Prisma } from '@/generated/prisma/client';

export async function nextPassSequence(
  tx: Prisma.TransactionClient,
  locationId: string,
  yearMonth: string,
): Promise<number> {
  // `LAST_INSERT_ID(1)` on the insert path (not a plain `1`): the table has no
  // AUTO_INCREMENT column, so on a fresh row — the first pass of a (location,
  // month) — a plain INSERT would leave the session's LAST_INSERT_ID() at its
  // previous value (0), and the `SELECT LAST_INSERT_ID()` below would read back
  // 0 → "...-0000". Seeding it to 1 makes the first pass number end in 0001,
  // matching the ON DUPLICATE KEY UPDATE branch.
  await tx.$executeRaw`
    INSERT INTO PassMonthlySequence (locationId, yearMonth, lastValue)
    VALUES (${locationId}, ${yearMonth}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE lastValue = LAST_INSERT_ID(lastValue + 1)
  `;

  const rows = await tx.$queryRaw<{ seq: number }[]>`SELECT LAST_INSERT_ID() AS seq`;
  return Number(rows[0].seq);
}
