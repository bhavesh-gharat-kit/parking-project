/**
 * GET /api/admin/dashboard — the admin's operational snapshot (context.txt
 * §20, Phase 10).
 *
 * No query params: this is "right now", not a report. `pendingUpi.../
 * pendingCash...` alone already separate the two approval queues §12 asks for
 * (`PAYMENT_VERIFICATION` vs `PENDING_APPROVAL`) — see
 * `apps/api/lib/admin/dashboard.ts` for how each number is built.
 */
import type { NextRequest } from 'next/server';

import { buildDashboardSummary } from '@/lib/admin/dashboard';
import { requireRole } from '@/lib/auth/guard';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN');
  if (!auth.ok) return auth.response;

  const summary = await buildDashboardSummary();

  return ok(summary, { headers: { 'Cache-Control': 'no-store' } });
}
