'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { AdminParkingLocation } from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { Pill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<AdminParkingLocation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setLocations(await apiRequest<AdminParkingLocation[]>('/api/admin/locations'));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load locations.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">Locations</h1>
        <Link href="/web/admin/locations/new" className="btn btn-primary">
          Add location
        </Link>
      </div>

      <div className="stack">
        {(locations ?? []).map((location) => (
          <div className="card card-header-row" key={location.id}>
            <div>
              <div className="card-header-row">
                <p className="text-small-bold">{location.name}</p>
                <Pill label={location.isActive ? 'Active' : 'Inactive'} tone={location.isActive ? 'done' : 'bad'} />
              </div>
              <p className="text-small text-secondary">
                {location.code} · {location.city}, {location.state}
              </p>
            </div>
            <div className="btn-row">
              <Link href={`/web/admin/locations/${location.id}/rates`} className="btn btn-secondary">
                Rates
              </Link>
              <Link href={`/web/admin/locations/${location.id}/passes`} className="btn btn-secondary">
                Passes
              </Link>
              <Link href={`/web/admin/locations/${location.id}`} className="btn btn-ghost">
                Edit
              </Link>
            </div>
          </div>
        ))}
        {locations !== null && locations.length === 0 ? (
          <div className="empty-state">No locations yet. Add one below.</div>
        ) : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
