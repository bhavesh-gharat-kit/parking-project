'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ParkingLocation } from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function BookLocationPage() {
  const [locations, setLocations] = useState<ParkingLocation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<ParkingLocation[]>('/api/locations');
        if (!cancelled) setLocations(items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load parking locations.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Choose a location</h1>
      <p className="text-small text-secondary">Choose where you&apos;re parking.</p>

      {locations === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(locations ?? []).map((location) => (
            <Link key={location.id} href={`/web/customer/book/${location.id}`} className="card-link">
              <div className="card">
                <p className="text-small-bold">{location.name}</p>
                <p className="text-small text-secondary">
                  {location.addressLine}, {location.city}
                </p>
              </div>
            </Link>
          ))}
          {locations !== null && locations.length === 0 ? (
            <div className="empty-state">No parking locations are available right now.</div>
          ) : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
