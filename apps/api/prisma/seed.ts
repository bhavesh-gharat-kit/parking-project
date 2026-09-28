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
  'business.name': 'Pay & Park',
  'business.supportPhone': '',
  'payment.upi.vpa': '',
  'payment.upi.payeeName': '',
  'booking.expiryMinutes': '10',
};

const KALYAN_LOCATION = {
  code: 'KLY',
  name: 'Kalyan',
  addressLine: 'Station Road, near Kalyan Railway Station',
  city: 'Kalyan',
  state: 'Maharashtra',
  pincode: '421301',
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
