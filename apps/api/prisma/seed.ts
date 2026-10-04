/**
 * Database seed — `npm run db:seed` (via `prisma db seed`).
 *
 * Phase 01 seeds only the `AppSetting` defaults: the values the receipt header
 * and the UPI payment screen read, which must exist for those screens to render
 * but must not be baked into the APK (context.txt §24). Everything is a
 * placeholder for the admin to correct.
 *
 * The Kalyan location and its Bike/Car rate table are Phase 04's seed
 * (context.txt §7, §23) — this file is where they go. Prices below are
 * starter values only, editable from the admin app the moment it exists
 * (§24) — they exist so the customer app has real data to render, not
 * because they are the business's actual pricing.
 *
 * Idempotent: safe to re-run. Existing values are left alone so re-seeding a
 * live database never overwrites something the admin has edited.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { formatDuration } from '@parking/shared';
import 'dotenv/config';

const DEFAULT_SETTINGS: Record<string, string> = {
  // D-UI1 (`_/ui-prompts/00-README.md`): "Kumar Enterprises" is the company
  // name shown on the receipt and the in-app brand header; "Pay & Park" stays
  // the installed app's own name (`app.config.ts`'s `VARIANTS`), not this.
  'business.name': 'Kumar Enterprises',
  // Udaykumar Mane, the on-site support contact per `_/by-client/file.txt` —
  // shown on the customer receipt (`receipt.tsx`). Not Rajkumar Mane's number
  // (the admin/operator): that one belongs on his ADMIN user account, which
  // only `npm run admin:create` can set, not this seed.
  'business.supportPhone': '7977776764',
  'payment.upi.vpa': '',
  'payment.upi.payeeName': '',
  'booking.expiryMinutes': '10',
  // D5 point 9 (Phase 20) — how long an unpaid pass application is held
  // before the expiry sweep cancels it. Separate from the booking window
  // above: a pass application has no live-at-the-gate urgency.
  'pass.expiryMinutes': '30',
};

const KALYAN_LOCATION = {
  code: 'KLY',
  name: 'Kalyan',
  // Per `_/by-client/file.txt` — the client's actual address for this branch.
  addressLine: 'Borgaonkar Wadi, near Kalyan Railway Station',
  city: 'Kalyan West',
  state: 'Maharashtra',
  pincode: '421301',
  contactPhone: '7977776764',
  // Real UPI details from `_/by-client/WhatsApp Image 2026-09-30 at
  // 6.39.36 PM.jpeg` (the Paytm Soundbox QR at this location) — decoded and
  // verified to scan correctly as `upi://pay?pa=paytm.s26ypuu@pty&pn=Paytm`
  // before being cropped and re-hosted below.
  upiVpa: 'paytm.s26ypuu@pty',
  upiQrImageUrl: 'https://media.kumarinfotech.com/media/parking-project/location-qr/kalyan-upi-qr.png',
};

/** durationMinutes + priceInPaise per vehicle type — starter rate table (§7). */
const KALYAN_RATES: { vehicleType: 'BIKE' | 'CAR'; durationMinutes: number; priceInPaise: number }[] = [
  { vehicleType: 'BIKE', durationMinutes: 60, priceInPaise: 1000 },
  { vehicleType: 'BIKE', durationMinutes: 120, priceInPaise: 1800 },
  { vehicleType: 'BIKE', durationMinutes: 1440, priceInPaise: 5000 },
  { vehicleType: 'CAR', durationMinutes: 60, priceInPaise: 2000 },
  { vehicleType: 'CAR', durationMinutes: 120, priceInPaise: 3500 },
  { vehicleType: 'CAR', durationMinutes: 1440, priceInPaise: 10000 },
];

/**
 * Starter `PassPlan` rows (`_/decisions.md` D5, Phase 19) — a representative
 * subset of the Weekly/15-Day/Monthly/3-Month × Bike/Car × Day/Night/Both
 * matrix, not the full cross-product, so Phase 20 has real data to build
 * against. Admin-editable from the moment the pass-plans screen exists.
 */
const KALYAN_PASS_PLANS: {
  vehicleType: 'BIKE' | 'CAR';
  shiftType: 'DAY' | 'NIGHT' | 'BOTH';
  label: string;
  validityMonths: number;
  priceInPaise: number;
  sortOrder: number;
}[] = [
  { vehicleType: 'BIKE', shiftType: 'DAY', label: 'Weekly', validityMonths: 1, priceInPaise: 15000, sortOrder: 0 },
  { vehicleType: 'BIKE', shiftType: 'DAY', label: 'Monthly', validityMonths: 1, priceInPaise: 40000, sortOrder: 1 },
  { vehicleType: 'BIKE', shiftType: 'DAY', label: '3-Month', validityMonths: 3, priceInPaise: 100000, sortOrder: 2 },
  { vehicleType: 'BIKE', shiftType: 'BOTH', label: 'Monthly', validityMonths: 1, priceInPaise: 60000, sortOrder: 3 },
  { vehicleType: 'CAR', shiftType: 'DAY', label: 'Weekly', validityMonths: 1, priceInPaise: 30000, sortOrder: 0 },
  { vehicleType: 'CAR', shiftType: 'DAY', label: 'Monthly', validityMonths: 1, priceInPaise: 80000, sortOrder: 1 },
  { vehicleType: 'CAR', shiftType: 'DAY', label: '3-Month', validityMonths: 3, priceInPaise: 200000, sortOrder: 2 },
  { vehicleType: 'CAR', shiftType: 'BOTH', label: 'Monthly', validityMonths: 1, priceInPaise: 120000, sortOrder: 3 },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

  try {
    let created = 0;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const result = await prisma.appSetting.upsert({
        where: { key },
        // Deliberately empty: never clobber an admin-edited value.
        update: {},
        create: { key, value },
      });
      if (result.value === value) created += 1;
    }
    console.log(`Seeded AppSetting defaults (${created}/${Object.keys(DEFAULT_SETTINGS).length} at default).`);

    // Deliberately no `update` beyond nothing (`{}`): re-running this after the
    // admin has edited Kalyan's address or a price must never overwrite it.
    const location = await prisma.parkingLocation.upsert({
      where: { code: KALYAN_LOCATION.code },
      update: {},
      create: KALYAN_LOCATION,
    });
    console.log(`Location ready: ${location.name} (${location.code}).`);

    let rateCount = 0;
    for (const rate of KALYAN_RATES) {
      await prisma.parkingRate.upsert({
        where: {
          locationId_vehicleType_durationMinutes: {
            locationId: location.id,
            vehicleType: rate.vehicleType,
            durationMinutes: rate.durationMinutes,
          },
        },
        update: {},
        create: {
          locationId: location.id,
          vehicleType: rate.vehicleType,
          durationMinutes: rate.durationMinutes,
          priceInPaise: rate.priceInPaise,
          label: formatDuration(rate.durationMinutes),
        },
      });
      rateCount += 1;
    }
    console.log(`Rates ready: ${rateCount} for ${location.name}.`);

    let passPlanCount = 0;
    for (const plan of KALYAN_PASS_PLANS) {
      await prisma.passPlan.upsert({
        where: {
          locationId_vehicleType_shiftType_label: {
            locationId: location.id,
            vehicleType: plan.vehicleType,
            shiftType: plan.shiftType,
            label: plan.label,
          },
        },
        update: {},
        create: {
          locationId: location.id,
          vehicleType: plan.vehicleType,
          shiftType: plan.shiftType,
          label: plan.label,
          validityMonths: plan.validityMonths,
          priceInPaise: plan.priceInPaise,
          sortOrder: plan.sortOrder,
        },
      });
      passPlanCount += 1;
    }
    console.log(`Pass plans ready: ${passPlanCount} for ${location.name}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
