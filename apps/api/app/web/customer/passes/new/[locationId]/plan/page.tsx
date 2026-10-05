'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatPassDuration,
  type PassPlan,
  type ShiftType,
  type VehicleType,
} from '@parking/shared';

import { Banner } from '../../../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../../../_lib/api';

export default function NewPassPlanPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const vehicleType = searchParams.get('vehicleType') as VehicleType | null;
  const shiftType = searchParams.get('shiftType') as ShiftType | null;

  const [plans, setPlans] = useState<PassPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleType) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<PassPlan[]>(
          `/api/locations/${locationId}/pass-plans?vehicleType=${vehicleType}`,
        );
        if (!cancelled) setPlans(items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load pass plans.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, vehicleType]);

  if (!vehicleType || !shiftType) {
    return (
      <div className="stack-loose">
        <h1 className="text-heading">Choose a plan</h1>
        <p className="text-small text-secondary">Choose a vehicle type and shift first.</p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => router.replace(`/web/customer/passes/new/${locationId}`)}
        >
          Choose vehicle &amp; shift
        </button>
      </div>
    );
  }

  // A `BOTH`-shift plan covers either shift the customer picked; a plan tied
  // to the other single shift does not (D5 point 2).
  const matchingPlans = (plans ?? []).filter(
    (plan) => plan.shiftType === shiftType || plan.shiftType === 'BOTH',
  );
  const selectedPlan = matchingPlans.find((plan) => plan.id === planId) ?? null;

  const continueToDetails = () => {
    if (!selectedPlan) return;
    router.push(
      `/web/customer/passes/new/${locationId}/details?passPlanId=${selectedPlan.id}` +
        `&vehicleType=${vehicleType}`,
    );
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Choose a plan</h1>
      <p className="text-small text-secondary">
        {VEHICLE_TYPE_LABELS[vehicleType]} · {SHIFT_TYPE_LABELS[shiftType]} plans at this location.
      </p>

      {plans === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {matchingPlans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className="card-link"
              style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              onClick={() => setPlanId(plan.id)}
            >
              <div className={`card${planId === plan.id ? ' card-selected' : ''}`}>
                <p className="text-small-bold">{plan.label}</p>
                <p className="text-small text-secondary">Valid {formatPassDuration(plan.durationUnit, plan.durationValue)}</p>
                <p className="text-primary">{formatInr(plan.priceInPaise)}</p>
              </div>
            </button>
          ))}
          {plans !== null && matchingPlans.length === 0 ? (
            <div className="empty-state">
              No {VEHICLE_TYPE_LABELS[vehicleType].toLowerCase()} pass plans for this shift yet.
            </div>
          ) : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!selectedPlan}
        onClick={continueToDetails}
      >
        {selectedPlan ? `Continue · ${selectedPlan.label} · ${formatInr(selectedPlan.priceInPaise)}` : 'Choose a plan to continue'}
      </button>
    </div>
  );
}
