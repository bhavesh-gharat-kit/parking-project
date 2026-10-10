'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  formatInr,
  formatPassDuration,
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  type AdminParkingLocation,
  type AdminPassPlan,
} from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { Pill } from '../../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../../_lib/api';

export default function AdminPassPlansPage() {
  const { id: locationId } = useParams<{ id: string }>();

  const [location, setLocation] = useState<AdminParkingLocation | null>(null);
  const [plans, setPlans] = useState<AdminPassPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [locationData, plansData] = await Promise.all([
        apiRequest<AdminParkingLocation>(`/api/admin/locations/${locationId}`),
        apiRequest<AdminPassPlan[]>(`/api/admin/pass-plans?locationId=${locationId}`),
      ]);
      setLocation(locationData);
      setPlans(plansData);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load pass plans.'));
    }
  }, [locationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const togglePlan = async (plan: AdminPassPlan) => {
    const action = plan.isActive ? 'Retire' : 'Re-activate';
    const title = `${VEHICLE_TYPE_LABELS[plan.vehicleType]} · ${SHIFT_TYPE_LABELS[plan.shiftType]} · ${plan.label}`;
    if (!confirm(`${action} "${title}" at ${formatInr(plan.priceInPaise)}?`)) return;

    setTogglingId(plan.id);
    try {
      if (plan.isActive) {
        await apiRequest(`/api/admin/pass-plans/${plan.id}`, {
          method: 'DELETE',
        });
      } else {
        await apiRequest(`/api/admin/pass-plans/${plan.id}`, {
          method: 'PATCH',
          body: {
            locationId,
            vehicleType: plan.vehicleType,
            shiftType: plan.shiftType,
            label: plan.label,
            durationUnit: plan.durationUnit,
            durationValue: plan.durationValue,
            priceInRupees: plan.priceInPaise / 100,
            sortOrder: plan.sortOrder,
            isActive: true,
          },
        });
      }
      await load();
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">{location ? `${location.name} pass plans` : 'Pass plans'}</h1>
        <Link href={`/web/admin/locations/${locationId}/passes/new`} className="btn btn-primary">
          Add plan
        </Link>
      </div>

      <div className="stack">
        {(plans ?? []).map((plan) => (
          <div className="card card-header-row" key={plan.id}>
            <div>
              <div className="card-header-row">
                <p className="text-small-bold">
                  {VEHICLE_TYPE_LABELS[plan.vehicleType]} · {SHIFT_TYPE_LABELS[plan.shiftType]} · {plan.label}
                </p>
                <Pill label={plan.isActive ? 'Active' : 'Retired'} tone={plan.isActive ? 'done' : 'bad'} />
              </div>
              <p className="text-small text-secondary">
                {formatInr(plan.priceInPaise)} · {formatPassDuration(plan.durationUnit, plan.durationValue)}
              </p>
            </div>
            <div className="btn-row">
              <Link href={`/web/admin/locations/${locationId}/passes/${plan.id}`} className="btn btn-secondary">
                Edit
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={togglingId === plan.id}
                onClick={() => void togglePlan(plan)}
              >
                {togglingId === plan.id ? 'Working…' : plan.isActive ? 'Retire' : 'Re-activate'}
              </button>
            </div>
          </div>
        ))}
        {plans !== null && plans.length === 0 ? (
          <div className="empty-state">No pass plans yet. Add one so customers have something to apply for.</div>
        ) : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
