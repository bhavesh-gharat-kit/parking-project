/**
 * GET /api/health
 *
 * Liveness + readiness in one endpoint, used by:
 *   - the Nginx/PM2 deploy check on the VPS (Phase 11),
 *   - the mobile app's "can't reach the server" screen,
 *   - a human verifying a fresh checkout actually talks to MySQL.
 *
 * It probes the database rather than just returning 200, because "Next.js is up"
 * and "the API can serve a booking" are different questions, and only the second
 * one matters operationally. A failed probe answers 503 so a load balancer or
 * uptime monitor treats it as down.
 */
import { HealthResponseSchema, type HealthResponse } from '@parking/shared';

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { ok, fail } from '@/lib/http';

/** Never prerendered or cached — a cached health check is worse than none. */
export const dynamic = 'force-dynamic';
/** Prisma's driver adapter needs Node APIs; not edge-compatible. */
export const runtime = 'nodejs';

const API_VERSION = '0.1.0';

export async function GET() {
  const startedAt = Date.now();
  let database: HealthResponse['database'] = 'down';
  let databaseLatencyMs: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
    databaseLatencyMs = Date.now() - startedAt;
  } catch (error) {
    console.error('[health] database probe failed:', error);
  }

  const payload: HealthResponse = {
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    databaseLatencyMs,
    version: API_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  // Parsing our own response keeps the handler honest about the shared contract:
  // if `HealthResponse` gains a field, this throws in development rather than
  // shipping a payload the mobile client cannot parse.
  const validated = HealthResponseSchema.parse(payload);

  if (database === 'down') {
    return fail(
      'SERVICE_UNAVAILABLE',
      `Database is unreachable (api ${validated.version}, env ${validated.environment}).`,
      { status: 503 },
    );
  }

  return ok(validated, { headers: { 'Cache-Control': 'no-store' } });
}
