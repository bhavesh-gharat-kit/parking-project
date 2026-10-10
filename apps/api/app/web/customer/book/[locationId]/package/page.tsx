'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatInr, VEHICLE_TYPE_LABELS, type Booking, type ParkingRate, type VehicleType } from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../../_lib/api';

export default function BookPackagePage() {
  const { locationId } = useParams<{ locationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const vehicleId = searchParams.get('vehicleId');
  const vehicleType = searchParams.get('vehicleType') as VehicleType | null;

  const [rates, setRates] = useState<ParkingRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!vehicleType) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<ParkingRate[]>(
          `/api/locations/${locationId}/rates?vehicleType=${vehicleType}`,
        );
        if (!cancelled) setRates(items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load parking packages.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, vehicleType]);

  if (!vehicleType || !vehicleId) {
    return (
      <div className="stack-loose">
        <h1 className="text-heading">Choose a package</h1>
        <p className="text-small text-secondary">
          Choose a vehicle first — parking packages are priced per vehicle type.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => router.replace(`/web/customer/book/${locationId}`)}
        >
          Choose a vehicle
        </button>
      </div>
    );
  }

  const selectedRate = rates?.find((rate) => rate.id === rateId) ?? null;
  const banner = submitError ?? loadError;

  const confirm = async () => {
    if (!rateId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const booking = await apiRequest<Booking>('/api/bookings', {
        method: 'POST',
        body: { locationId, vehicleId, rateId },
      });
      router.replace(`/web/customer/bookings/${booking.id}`);
    } catch (error) {
      setSubmitError(errorMessage(error, 'Could not create your booking. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Choose a package</h1>
      <p className="text-small text-secondary">
        {VEHICLE_TYPE_LABELS[vehicleType]} packages at this location.
      </p>

      {rates === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(rates ?? []).map((rate) => (
            <button
              key={rate.id}
              type="button"
              className="card-link"
              style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              onClick={() => setRateId(rate.id)}
            >
              <div className={`card${rateId === rate.id ? ' card-selected' : ''}`}>
                <p className="text-small-bold">{rate.label}</p>
                <p className="text-primary">{formatInr(rate.priceInPaise)}</p>
              </div>
            </button>
          ))}
          {rates !== null && rates.length === 0 ? (
            <div className="empty-state">
              No {VEHICLE_TYPE_LABELS[vehicleType].toLowerCase()} packages at this location yet.
            </div>
          ) : null}
        </div>
      )}

      {banner ? <Banner kind="danger">{banner}</Banner> : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!selectedRate || submitting}
        onClick={() => void confirm()}
      >
        {submitting
          ? 'Booking…'
          : selectedRate
            ? `Continue · ${selectedRate.label} · ${formatInr(selectedRate.priceInPaise)}`
            : 'Choose a package to continue'}
      </button>
    </div>
  );
}
