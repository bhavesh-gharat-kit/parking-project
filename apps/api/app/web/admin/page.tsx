'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatInr, type AdminDashboardSummary } from '@parking/shared';

import { Banner } from '../_components/Banner';
import { apiRequest, errorMessage } from '../_lib/api';

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSummary(await apiRequest<AdminDashboardSummary>('/api/admin/dashboard'));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load the dashboard.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Admin dashboard</h1>

      {summary === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        summary?.locations.map((location) => (
          <div className="stack" key={location.locationId}>
            {summary.locations.length > 1 ? <p className="text-small-bold">{location.locationName}</p> : null}

            <div className="grid-stats">
              <div className="card">
                <p className="text-subtitle">{location.todayBookingsCount}</p>
                <p className="text-small text-secondary">Today&apos;s bookings</p>
              </div>
              <div className="card">
                <p className="text-subtitle">{location.confirmedBookingsCount}</p>
                <p className="text-small text-secondary">Confirmed today</p>
              </div>
              <div className="card">
                <p className="text-subtitle">{location.pendingUpiVerificationCount}</p>
                <p className="text-small text-secondary">UPI verification</p>
              </div>
              <div className="card">
                <p className="text-subtitle">{location.pendingCashApprovalCount}</p>
                <p className="text-small text-secondary">Cash approval</p>
              </div>
            </div>

            <div className="card">
              <p className="text-small text-secondary">Today&apos;s revenue</p>
              <p className="text-subtitle text-primary">{formatInr(location.todayRevenueInPaise)}</p>
            </div>
          </div>
        ))
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}

      <div className="stack">
        <Link href="/web/admin/bookings" className="btn btn-primary btn-block">
          Booking approvals
        </Link>
        <Link href="/web/admin/reports" className="btn btn-primary btn-block">
          Reports
        </Link>
        <Link href="/web/admin/users" className="btn btn-primary btn-block">
          Users
        </Link>
        <Link href="/web/admin/locations" className="btn btn-secondary btn-block">
          Locations &amp; rates
        </Link>
      </div>
    </div>
  );
}
