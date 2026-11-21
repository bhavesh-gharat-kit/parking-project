'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type BookingStatus,
  type Paginated,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { Pagination } from '../../_components/Pagination';
import { StatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';
import { usePagination } from '../../_lib/use-pagination';

type QueueFilter = 'ALL' | BookingStatus;

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: 'PAYMENT_VERIFICATION', label: 'UPI verification' },
  { value: 'PENDING_APPROVAL', label: 'Cash approval' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState<QueueFilter>('PAYMENT_VERIFICATION');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, changePageSize, resetPage, begin, isCurrent } = usePagination(20);

  const load = useCallback(async () => {
    const requestId = begin();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.set('status', filter);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const result = await apiRequest<Paginated<AdminBooking>>(`/api/admin/bookings?${params.toString()}`);
      if (!isCurrent(requestId)) return;
      setBookings(result.items);
      setTotal(result.total);
    } catch (error) {
      if (isCurrent(requestId)) setLoadError(errorMessage(error, 'Could not load bookings.'));
    } finally {
      if (isCurrent(requestId)) setLoading(false);
    }
  }, [filter, search, page, pageSize, begin, isCurrent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-filter-change; the callback is stable via useCallback
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Bookings</h1>

      <form
        className="filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          resetPage();
        }}
      >
        <input
          className="input"
          placeholder="Search booking #, vehicle, customer"
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
            onClick={() => {
              setFilter(item.value);
              resetPage();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {bookings === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(bookings ?? []).map((booking) => (
            <Link key={booking.id} href={`/web/admin/bookings/${booking.id}`} className="card-link">
              <div className="card">
                <div className="card-header-row">
                  <p className="text-small-bold">{booking.bookingNumber}</p>
                  <p className="text-small-bold text-primary">{formatInr(booking.amountInPaise)}</p>
                </div>
                <p className="text-small text-secondary">
                  {booking.customer.name ?? booking.customer.email} · {booking.vehicleNumber}
                </p>
                <p className="text-small text-secondary">{formatIstDateTime(booking.startTime)}</p>
                <div className="card-header-row">
                  <StatusPill status={booking.status} />
                  {booking.paymentMethod ? (
                    <span className="text-small text-secondary">{PAYMENT_METHOD_LABELS[booking.paymentMethod]}</span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
          {bookings !== null && bookings.length === 0 ? (
            <div className="empty-state">Nothing here right now.</div>
          ) : null}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
        disabled={loading}
      />

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
