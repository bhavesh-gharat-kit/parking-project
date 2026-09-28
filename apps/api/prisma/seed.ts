/**
 * Database seed — `npm run db:seed` (via `prisma db seed`).
 *
 * Phase 01 seeds only the `AppSetting` defaults: the values the receipt header
 * and the UPI payment screen read, which must exist for those screens to render
 * but must not be baked into the APK (context.txt §24). Everything is a
 * placeholder for the admin to correct.
 *
 * The Kalyan location and its Bike/Car rate table are Phase 04's seed
 * (context.txt §7, §23) — this file is where they go.
 *
 * Idempotent: safe to re-run. Existing values are left alone so re-seeding a
 * live database never overwrites something the admin has edited.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

const DEFAULT_SETTINGS: Record<string, string> = {
  'business.name': 'Pay & Park',
  'business.supportPhone': '',
  'payment.upi.vpa': '',
  'payment.upi.payeeName': '',
  'booking.expiryMinutes': '10',
};

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
    console.log('Locations and parking rates are seeded in Phase 04.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
