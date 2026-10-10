'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { VEHICLE_TYPE_LABELS, type Vehicle } from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setVehicles(await apiRequest<Vehicle[]>('/api/vehicles'));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load your vehicles.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const deleteVehicle = async (vehicle: Vehicle) => {
    if (!confirm(`Remove ${vehicle.number} from your account?`)) return;
    setDeletingId(vehicle.id);
    try {
      await apiRequest(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
      setVehicles((current) => current?.filter((item) => item.id !== vehicle.id) ?? null);
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">My vehicles</h1>
        <Link href="/web/customer/vehicles/new" className="btn btn-primary">
          Add vehicle
        </Link>
      </div>

      <div className="stack">
        {(vehicles ?? []).map((vehicle) => (
          <div className="card card-header-row" key={vehicle.id}>
            <div>
              <p className="text-small-bold">{vehicle.number}</p>
              <p className="text-small text-secondary">
                {VEHICLE_TYPE_LABELS[vehicle.type]}
                {vehicle.makeModel ? ` · ${vehicle.makeModel}` : ''}
              </p>
            </div>
            <div className="btn-row">
              <Link href={`/web/customer/vehicles/${vehicle.id}`} className="btn btn-secondary">
                Edit
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deletingId === vehicle.id}
                onClick={() => void deleteVehicle(vehicle)}
              >
                {deletingId === vehicle.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ))}
        {vehicles !== null && vehicles.length === 0 ? (
          <div className="empty-state">No vehicles yet. Add one to book parking for it.</div>
        ) : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
