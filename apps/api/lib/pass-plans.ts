/**
 * Pass plan lookups and the two public projections, shared by the routes
 * under `app/api/locations/[id]/pass-plans` and `app/api/admin/pass-plans/**`
 * (`_/decisions.md` D5, Phase 19).
 */
import type { PassPlan as PassPlanRow } from '@/generated/prisma/client';
import type { AdminPassPlan, PassPlan } from '@parking/shared';

import { prisma } from '@/lib/db';

/** D5 point 2 — what the customer's plan list sees. Never `isActive` (already filtered). */
export function toPassPlan(plan: PassPlanRow): PassPlan {
  return {
    id: plan.id,
    locationId: plan.locationId,
    vehicleType: plan.vehicleType,
    shiftType: plan.shiftType,
    label: plan.label,
    durationUnit: plan.durationUnit,
    durationValue: plan.durationValue,
    priceInPaise: plan.priceInPaise,
    sortOrder: plan.sortOrder,
  };
}

/** What the admin pass-plan management screen sees. */
export function toAdminPassPlan(plan: PassPlanRow): AdminPassPlan {
  return {
    ...toPassPlan(plan),
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * A plan scoped to a specific location, the same "filter in the query, never
 * fetch-then-compare" shape as `findRateInLocation` — a plan ID from another
 * location must read as `NOT_FOUND`, not a 403 that confirms the ID is real.
 */
export async function findPassPlanInLocation(
  locationId: string,
  planId: string,
): Promise<PassPlanRow | null> {
  return prisma.passPlan.findFirst({ where: { id: planId, locationId } });
}
