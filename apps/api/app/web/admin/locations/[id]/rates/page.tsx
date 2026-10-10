'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  formatInr,
  VEHICLE_TYPE_LABELS,
  type AdminParkingLocation,
  type AdminParkingRate,
} from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { Pill } from '../../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../../_lib/api';

export default function AdminRatesPage() {
  const { id: locationId } = useParams<{ id: string }>();

  const [location, setLocation] = useState<AdminParkingLocation | null>(null);
  const [rates, setRates] = useState<AdminParkingRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [locationData, ratesData] = await Promise.all([
        apiRequest<AdminParkingLocation>(`/api/admin/locations/${locationId}`),
        apiRequest<AdminParkingRate[]>(`/api/admin/locations/${locationId}/rates`),
      ]);
      setLocation(locationData);
      setRates(ratesData);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load rates.'));
    }
  }, [locationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const toggleRate = async (rate: AdminParkingRate) => {
    const action = rate.isActive ? 'Retire' : 'Re-activate';
    if (!confirm(`${action} "${VEHICLE_TYPE_LABELS[rate.vehicleType]} · ${rate.label}" at ${formatInr(rate.priceInPaise)}?`)) return;

    setTogglingId(rate.id);
    try {
      if (rate.isActive) {
        await apiRequest(`/api/admin/locations/${locationId}/rates/${rate.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/api/admin/locations/${locationId}/rates/${rate.id}`, {
          method: 'PATCH',
          body: {
            vehicleType: rate.vehicleType,
            durationMinutes: rate.durationMinutes,
            priceInRupees: rate.priceInPaise / 100,
            sortOrder: rate.sortOrder,
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
        <h1 className="text-heading">{location ? `${location.name} rates` : 'Rates'}</h1>
        <Link href={`/web/admin/locations/${locationId}/rates/new`} className="btn btn-primary">
          Add rate
        </Link>
      </div>

      <div className="stack">
        {(rates ?? []).map((rate) => (
          <div className="card card-header-row" key={rate.id}>
            <div>
              <div className="card-header-row">
                <p className="text-small-bold">
                  {VEHICLE_TYPE_LABELS[rate.vehicleType]} · {rate.label}
                </p>
                <Pill label={rate.isActive ? 'Active' : 'Retired'} tone={rate.isActive ? 'done' : 'bad'} />
              </div>
              <p className="text-small text-secondary">{formatInr(rate.priceInPaise)}</p>
            </div>
            <div className="btn-row">
              <Link href={`/web/admin/locations/${locationId}/rates/${rate.id}`} className="btn btn-secondary">
                Edit
              </Link>
              <button type="button" className="btn btn-ghost" disabled={togglingId === rate.id} onClick={() => void toggleRate(rate)}>
                {togglingId === rate.id ? 'Working…' : rate.isActive ? 'Retire' : 'Re-activate'}
              </button>
            </div>
          </div>
        ))}
        {rates !== null && rates.length === 0 ? (
          <div className="empty-state">No rates yet. Add one so customers have something to book.</div>
        ) : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
