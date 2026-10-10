/**
 * Admin-editable business settings (the `AppSetting` table).
 *
 * The point of the table, per context.txt §24, is that the values a
 * non-developer needs to change — the business name on a receipt, the UPI ID on
 * the payment screen, how long a booking is held — are editable at runtime
 * rather than baked into the APK or a `.env` that needs a redeploy.
 *
 * Every getter here therefore reads the table first and falls back to the
 * environment. Deliberately uncached: these are read once per booking creation
 * and once per sweep run, so a primary-key lookup on a table with five rows is
 * not worth the risk of an admin editing a value and being told for the next
 * five minutes that it has not changed.
 *
 * A malformed value is logged and ignored rather than thrown: a typo in the
 * admin form must not take booking creation down at a parking gate.
 */
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

/** Keys this module knows about. The seed (`prisma/seed.ts`) creates them all. */
export const SETTING_KEYS = {
  businessName: 'business.name',
  supportPhone: 'business.supportPhone',
  upiVpa: 'payment.upi.vpa',
  upiPayeeName: 'payment.upi.payeeName',
  bookingExpiryMinutes: 'booking.expiryMinutes',
  /** D5 point 9 — how long an unpaid pass application is held before the
   *  expiry sweep cancels it. Same mechanism as `bookingExpiryMinutes`. */
  passExpiryMinutes: 'pass.expiryMinutes',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

async function readSetting(key: SettingKey): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  const value = row?.value?.trim();
  return value ? value : null;
}

/**
 * context.txt §15 — how many minutes an unfinished booking is held before the
 * sweep expires it. `AppSetting['booking.expiryMinutes']`, else
 * `BOOKING_EXPIRY_MINUTES`, else 10.
 *
 * Capped at a day: the setting exists so the business can say "give them 15
 * minutes", not so a fat-fingered `1000000` can hold bookings open forever.
 */
const MAX_EXPIRY_MINUTES = 1440;

export async function getBookingExpiryMinutes(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.bookingExpiryMinutes);
  if (raw === null) return env.BOOKING_EXPIRY_MINUTES;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_EXPIRY_MINUTES) {
    console.warn(
      `[settings] ignoring AppSetting["${SETTING_KEYS.bookingExpiryMinutes}"] = ${JSON.stringify(raw)}` +
        ` — expected a whole number of minutes between 1 and ${MAX_EXPIRY_MINUTES}.` +
        ` Falling back to BOOKING_EXPIRY_MINUTES=${env.BOOKING_EXPIRY_MINUTES}.`,
    );
    return env.BOOKING_EXPIRY_MINUTES;
  }

  return parsed;
}

/**
 * D5 point 9 — how many minutes an unpaid pass application is held before the
 * sweep (`app/api/cron/expire-passes`) cancels it.
 * `AppSetting['pass.expiryMinutes']`, else `DEFAULT_PASS_EXPIRY_MINUTES`.
 *
 * Unlike `getBookingExpiryMinutes` there is no `.env` fallback constant for
 * this one — a pass application has no live-at-the-gate urgency the way a
 * daily booking does, so there is nothing here a deploy-time `.env` value
 * would need to override on day one; the admin can set it from the moment
 * the setting exists.
 */
const DEFAULT_PASS_EXPIRY_MINUTES = 30;

export async function getPassExpiryMinutes(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.passExpiryMinutes);
  if (raw === null) return DEFAULT_PASS_EXPIRY_MINUTES;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_EXPIRY_MINUTES) {
    console.warn(
      `[settings] ignoring AppSetting["${SETTING_KEYS.passExpiryMinutes}"] = ${JSON.stringify(raw)}` +
        ` — expected a whole number of minutes between 1 and ${MAX_EXPIRY_MINUTES}.` +
        ` Falling back to ${DEFAULT_PASS_EXPIRY_MINUTES}.`,
    );
    return DEFAULT_PASS_EXPIRY_MINUTES;
  }

  return parsed;
}

/**
 * §11 — the business-wide UPI ID, used when a `ParkingLocation` has none of its
 * own set. `null` means neither is configured, which the payment-method
 * endpoint treats as "no VPA to show" rather than a hard error — a branch that
 * only takes cash for now must not be blocked from opening.
 */
export async function getGlobalUpiVpa(): Promise<string | null> {
  return readSetting(SETTING_KEYS.upiVpa);
}

/** §17 — the receipt header. Falls back to the seed's own default name. */
export async function getBusinessName(): Promise<string> {
  return (await readSetting(SETTING_KEYS.businessName)) ?? 'Pay & Park';
}

/** §17 — the receipt footer, `null` if the admin has not set one yet. */
export async function getSupportPhone(): Promise<string | null> {
  return readSetting(SETTING_KEYS.supportPhone);
}
