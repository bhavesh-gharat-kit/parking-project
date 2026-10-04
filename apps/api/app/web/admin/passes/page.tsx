'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  formatInr,
  formatIstDate,
  type AdminPass,
  type Paginated,
  type PassBookingStatus,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { PassStatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

type QueueFilter = 'ALL' | PassBookingStatus;

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: 'PAYMENT_VERIFICATION', label: 'UPI verification' },
  { value: 'PENDING_APPROVAL', label: 'Cash approval' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

/** The same "pending work" tiles the admin dashboard shows for daily
 *  bookings (`buildDashboardSummary`), built from two cheap `total` reads
 *  rather than a dedicated aggregate endpoint. */
function useQueueCounts() {
  const [counts, setCounts] = useState<{ upi: number; cash: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [upi, cash] = await Promise.all([
        apiRequest<Paginated<AdminPass>>('/api/admin/passes?status=PAYMENT_VERIFICATION&pageSize=1'),
        apiRequest<Paginated<AdminPass>>('/api/admin/passes?status=PENDING_APPROVAL&pageSize=1'),
      ]);
      setCounts({ upi: upi.total, cash: cash.total });
    } catch {
      // Non-fatal — the tiles just stay hidden.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; `load` is stable via useCallback
    void load();
  }, [load]);

  return counts;
}

export default function AdminPassesPage() {
  const [filter, setFilter] = useState<QueueFilter>('PAYMENT_VERIFICATION');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [passes, setPasses] = useState<AdminPass[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const counts = useQueueCounts();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.set('status', filter);
      if (search) params.set('search', search);
      params.set('pageSize', '50');

      const page = await apiRequest<Paginated<AdminPass>>(`/api/admin/passes?${params.toString()}`);
      setPasses(page.items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load pass applications.'));
    }
  }, [filter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-filter-change; the callback is stable via useCallback
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Passes</h1>

      {counts ? (
        <div className="grid-stats">
          <div className="card">
            <p className="text-subtitle">{counts.upi}</p>
            <p className="text-small text-secondary">UPI verification</p>
          </div>
          <div className="card">
            <p className="text-subtitle">{counts.cash}</p>
            <p className="text-small text-secondary">Cash approval</p>
          </div>
        </div>
      ) : null}

      <form
        className="filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <input
          className="input"
          placeholder="Search pass #, vehicle, customer"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      <div className="chip-row">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`chip${filter === item.value ? ' selected' : ''}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {passes === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(passes ?? []).map((passBooking) => (
            <Link key={passBooking.id} href={`/web/admin/passes/${passBooking.id}`} className="card-link">
              <div className="card">
                <div className="card-header-row">
                  <p className="text-small-bold">{passBooking.passNumber}</p>
                  <p className="text-small-bold text-primary">{formatInr(passBooking.amountInPaise)}</p>
                </div>
                <p className="text-small text-secondary">
                  {passBooking.customer.name ?? passBooking.customer.email} · {passBooking.vehicleNumber}
                </p>
                <p className="text-small text-secondary">
                  {passBooking.planLabel} · valid {formatIstDate(passBooking.startDate)} –{' '}
                  {formatIstDate(passBooking.endDate)}
                </p>
                <div className="card-header-row">
                  <PassStatusPill status={passBooking.status} />
                  {passBooking.paymentMethod ? (
                    <span className="text-small text-secondary">
                      {PAYMENT_METHOD_LABELS[passBooking.paymentMethod]}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
          {passes !== null && passes.length === 0 ? <div className="empty-state">Nothing here right now.</div> : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
