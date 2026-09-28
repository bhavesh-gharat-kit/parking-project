/**
 * The Prisma client singleton.
 *
 * Prisma 7 talks to MySQL/MariaDB through the `@prisma/adapter-mariadb` driver
 * adapter instead of its own Rust engine, so the connection pool is configured
 * here in JS rather than through query parameters on the URL.
 *
 * The `globalThis` cache is not a micro-optimisation: `next dev` re-evaluates
 * modules on every hot reload, and without it each reload opens a fresh pool
 * until MySQL starts refusing connections.
 */
import type { PoolConfig } from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '@/generated/prisma/client';
import { env, isProduction } from './env';

/**
 * The adapter's pool options (`connectionLimit` among them) live on a
 * `mariadb.PoolConfig`, which does not accept a URL — so translate the one
 * `DATABASE_URL` everything else uses rather than introducing a second way to
 * configure the database.
 */
function poolConfigFromUrl(databaseUrl: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. Expected mysql://user:password@host:port/database',
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL is missing a database name (the path after the host).');
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    // MariaDB installs often run a local root with no password; `undefined`
    // rather than '' is what the driver expects in that case.
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database,
    // The VPS runs one MySQL shared with other apps (Phase 11). Stay modest and
    // raise this only if the API starts queuing on the pool.
    connectionLimit: 5,
    // Fail fast instead of hanging a request for the driver's default timeout.
    connectTimeout: 10_000,
    // Booking amounts are integer paise, but MySQL still returns BIGINT for
    // things like COUNT(*); make those plain numbers so JSON.stringify works.
    insertIdAsNumber: true,
    decimalAsNumber: true,
    bigIntAsNumber: true,
  };
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb(poolConfigFromUrl(env.DATABASE_URL));

  return new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
