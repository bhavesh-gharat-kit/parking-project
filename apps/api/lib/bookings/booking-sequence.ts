/**
 * Atomic per-(location, day) counter backing the sequential booking number
 * (§17, `booking-number.ts`).
 *
 * ── Why `INSERT ... ON DUPLICATE KEY UPDATE ... LAST_INSERT_ID(expr)` ──────
 * This is the standard MySQL/MariaDB idiom for a race-free counter without an
 * explicit `SELECT ... FOR UPDATE`: the `INSERT`'s own row lock makes the
 * read-increment-write atomic, and `LAST_INSERT_ID(expr)` records `expr` as
 * this connection's last-insert-id — retrievable with a plain
 * `SELECT LAST_INSERT_ID()` on the same connection — regardless of whether the
 * table has an AUTO_INCREMENT column. Supported since MySQL 4.1 and on this
 * project's MariaDB 10.4 (see `_/decisions.md`).
 *
 * ── Why this must run inside the caller's transaction ──────────────────────
 * `createBooking` (`create.ts`) calls this and then inserts the `Booking` row
 * in the *same* `prisma.$transaction`. `LAST_INSERT_ID()` is connection-scoped,
 * so the increment and the read-back have to happen on one connection — an
 * interactive Prisma transaction guarantees that; two independent calls would
 * not. Running the increment in the same transaction as the insert also means
 * a rolled-back booking (any failure after this point) rolls the counter back
 * with it, so a failed attempt does not burn a number out of the day's
 * sequence.
 */
import type { Prisma } from '@/generated/prisma/client';

export async function nextBookingSequence(
  tx: Prisma.TransactionClient,
  locationId: string,
  dateStamp: string,
): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO BookingDailySequence (locationId, dateStamp, lastValue)
    VALUES (${locationId}, ${dateStamp}, 1)
    ON DUPLICATE KEY UPDATE lastValue = LAST_INSERT_ID(lastValue + 1)
  `;

  const rows = await tx.$queryRaw<{ seq: number }[]>`SELECT LAST_INSERT_ID() AS seq`;
  return Number(rows[0].seq);
}
