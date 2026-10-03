'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatInr,
  type AdminReport,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { apiRequest, errorMessage } from '../../_lib/api';

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-header-row">
      <span className="text-small text-secondary">{label}</span>
      <span className="text-small-bold">{value}</span>
    </div>
  );
}

export default function AdminReportsPage() {
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  const [appliedRange, setAppliedRange] = useState({ dateFrom: '', dateTo: '' });
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (appliedRange.dateFrom) params.set('dateFrom', appliedRange.dateFrom);
      if (appliedRange.dateTo) params.set('dateTo', appliedRange.dateTo);
      setReport(await apiRequest<AdminReport>(`/api/admin/reports?${params.toString()}`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load the report.'));
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-range-change; the callback is stable via useCallback
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Reports</h1>

      <div className="filter-row">
        <input
          className="input"
          placeholder="From (YYYY-MM-DD)"
          value={dateFromInput}
          onChange={(event) => setDateFromInput(event.target.value)}
        />
        <input
          className="input"
          placeholder="To (YYYY-MM-DD)"
          value={dateToInput}
          onChange={(event) => setDateToInput(event.target.value)}
        />
      </div>
      <p className="text-small text-secondary">Leave both blank for all time.</p>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => setAppliedRange({ dateFrom: dateFromInput.trim(), dateTo: dateToInput.trim() })}
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDateFromInput('');
            setDateToInput('');
            setAppliedRange({ dateFrom: '', dateTo: '' });
          }}
        >
          Clear
        </button>
      </div>

      {report === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        report?.locations.map((location) => (
          <div className="card" key={location.locationId}>
            {report.locations.length > 1 ? <p className="text-small-bold">{location.locationName}</p> : null}

            <StatRow label="Total bookings" value={String(location.totalBookings)} />
            <StatRow label="Confirmed" value={String(location.confirmedBookings)} />
            <StatRow label="Rejected" value={String(location.rejectedBookings)} />
            <StatRow label="Cancelled" value={String(location.cancelledBookings)} />

            <hr className="divider" />

            <StatRow label="Total revenue" value={formatInr(location.totalRevenueInPaise)} />
            {PAYMENT_METHODS.map((method) => (
              <StatRow key={method} label={PAYMENT_METHOD_LABELS[method]} value={formatInr(location.revenueByMethod[method])} />
            ))}

            <hr className="divider" />

            {VEHICLE_TYPES.map((vehicleType) => (
              <StatRow key={vehicleType} label={VEHICLE_TYPE_LABELS[vehicleType]} value={formatInr(location.revenueByVehicleType[vehicleType])} />
            ))}
          </div>
        ))
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
