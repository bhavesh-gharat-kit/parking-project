'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  formatInr,
  formatPassDuration,
  type PassBooking,
  type PassPlan,
} from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../../_lib/api';

// Only bike parking is offered — no vehicle-type step (`VEHICLE_TYPES` has
// `CAR`/`OTHER` too, but no pass plans are sold for them at any location).
const VEHICLE_TYPE = 'BIKE';

const SHIFT_FILTERS = ['ALL', ...SHIFT_TYPES] as const;
type ShiftFilter = (typeof SHIFT_FILTERS)[number];

const SHIFT_FILTER_LABELS: Record<ShiftFilter, string> = {
  ALL: 'All',
  ...SHIFT_TYPE_LABELS,
};

export default function NewPassPlanPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const renewFrom = searchParams.get('renewFrom');

  const [plans, setPlans] = useState<PassPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('ALL');
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<PassPlan[]>(
          `/api/locations/${locationId}/pass-plans?vehicleType=${VEHICLE_TYPE}`,
        );
        if (!cancelled) setPlans(items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load pass plans.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  // Renewal convenience pre-fill only — mirrors the details page's "never
  // trusted, just a starting point" pattern. If the old pass's plan tier was
  // since edited or retired, this just leaves the filter/selection at their
  // defaults and the customer picks manually.
  useEffect(() => {
    if (!renewFrom || plans === null) return;
    let cancelled = false;
    (async () => {
      try {
        const oldPass = await apiRequest<PassBooking>(`/api/passes/${renewFrom}`);
        if (cancelled) return;
        setShiftFilter(oldPass.shiftType);
        if (plans.some((plan) => plan.id === oldPass.passPlanId)) {
          setPlanId(oldPass.passPlanId);
        }
      } catch {
        // No old pass to pre-fill from — filters just stay at their defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [renewFrom, plans]);

  const visiblePlans = (plans ?? []).filter(
    (plan) => shiftFilter === 'ALL' || plan.shiftType === shiftFilter,
  );
  const selectedPlan = visiblePlans.find((plan) => plan.id === planId) ?? null;

  const continueToDetails = () => {
    if (!selectedPlan) return;
    router.push(
      `/web/customer/passes/new/${locationId}/details?passPlanId=${selectedPlan.id}` +
        `&vehicleType=${VEHICLE_TYPE}` +
        (renewFrom ? `&renewFrom=${renewFrom}` : ''),
    );
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Choose a plan</h1>
      <p className="text-small text-secondary">Bike parking plans at this location.</p>

      <div className="chip-row">
        {SHIFT_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`chip${shiftFilter === filter ? ' selected' : ''}`}
            onClick={() => {
              setShiftFilter(filter);
              setPlanId(null);
            }}
          >
            {SHIFT_FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {plans === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {visiblePlans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className="card-link"
              style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              onClick={() => setPlanId(plan.id)}
            >
              <div className={`card plan-card${planId === plan.id ? ' card-selected' : ''}`}>
                <div className="plan-card-top">
                  <p className="text-small-bold">{plan.label} - {plan.shiftType=="BOTH"?"Day & Night":plan.shiftType}</p>
                  <p className="plan-card-price">{formatInr(plan.priceInPaise)}</p>
                </div>
                <p className="text-small text-secondary">
                  Valid {formatPassDuration(plan.durationUnit, plan.durationValue)}
                </p>
              </div>
            </button>
          ))}
          {plans !== null && visiblePlans.length === 0 ? (
            <div className="empty-state">No bike pass plans for this filter yet.</div>
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
