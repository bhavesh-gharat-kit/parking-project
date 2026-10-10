/**
 * Prisma 7 moves the datasource URL out of `schema.prisma` and into this file, so
 * the connection string is resolved by normal Node env loading rather than by
 * Prisma's own `env()` interpolation.
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    /** `npm run db:seed` / `prisma db seed`. */
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
