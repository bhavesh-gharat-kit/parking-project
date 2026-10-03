'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { VEHICLE_TYPE_LABELS, type Vehicle } from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../_lib/api';

export default function BookVehiclePage() {
  const { locationId } = useParams<{ locationId: string }>();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<Vehicle[]>('/api/vehicles');
        if (!cancelled) setVehicles(items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load your vehicles.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = vehicles !== null && vehicles.length === 0;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Choose a vehicle</h1>
      <p className="text-small text-secondary">Which vehicle are you parking?</p>

      {vehicles === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(vehicles ?? []).map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/web/customer/book/${locationId}/package?vehicleId=${vehicle.id}&vehicleType=${vehicle.type}`}
              className="card-link"
            >
              <div className="card">
                <p className="text-small-bold">{vehicle.number}</p>
                <p className="text-small text-secondary">
                  {VEHICLE_TYPE_LABELS[vehicle.type]}
                  {vehicle.makeModel ? ` · ${vehicle.makeModel}` : ''}
                </p>
              </div>
            </Link>
          ))}
          {isEmpty ? (
            <div className="empty-state">You have no vehicles yet. Add one to book parking for it.</div>
          ) : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}

      <Link
        href="/web/customer/vehicles/new"
        className={`btn btn-block ${isEmpty ? 'btn-primary' : 'btn-secondary'}`}
      >
        Add a vehicle
      </Link>
    </div>
  );
}
