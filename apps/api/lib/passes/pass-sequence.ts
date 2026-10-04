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
  await tx.$executeRaw`
    INSERT INTO PassMonthlySequence (locationId, yearMonth, lastValue)
    VALUES (${locationId}, ${yearMonth}, 1)
    ON DUPLICATE KEY UPDATE lastValue = LAST_INSERT_ID(lastValue + 1)
  `;

  const rows = await tx.$queryRaw<{ seq: number }[]>`SELECT LAST_INSERT_ID() AS seq`;
  return Number(rows[0].seq);
}
