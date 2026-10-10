'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type AdminUser,
  type Paginated,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Pill, StatusPill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [profile, history] = await Promise.all([
        apiRequest<AdminUser>(`/api/admin/users/${id}`),
        apiRequest<Paginated<AdminBooking>>(`/api/admin/bookings?userId=${id}&pageSize=20`),
      ]);
      setUser(profile);
      setBookings(history.items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this user.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const toggleActive = async () => {
    if (!user) return;
    const disabling = user.isActive;
    const confirmMessage = disabling
      ? 'They will be signed out immediately and cannot sign in again until re-enabled.'
      : 'They will be able to sign in again.';
    if (!confirm(confirmMessage)) return;

    setToggling(true);
    try {
      setUser(await apiRequest<AdminUser>(`/api/admin/users/${id}`, { method: 'PATCH', body: { isActive: !disabling } }));
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setToggling(false);
    }
  };

  if (user === null) {
    return (
      <div className="stack-loose">
        {loadError ? (
          <>
            <Banner kind="danger">{loadError}</Banner>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <div className="loading-center">Loading…</div>
        )}
      </div>
    );
  }

  return (
    <div className="stack-loose">
      <div className="card">
        <div className="card-header-row">
          <p className="text-small-bold">{user.name ?? '(no name on file)'}</p>
          <Pill label={user.isActive ? 'Active' : 'Disabled'} tone={user.isActive ? 'done' : 'bad'} />
        </div>
        <p className="text-small text-secondary">{user.email}</p>
        {user.phone ? <p className="text-small text-secondary">{user.phone}</p> : null}
        <p className="text-small text-secondary">
          {user.role} · {user.signInMethods.join(' + ') || 'No sign-in method'}
        </p>
        <p className="text-small text-secondary">Joined {formatIstDateTime(user.createdAt)}</p>
      </div>

      <button type="button" className="btn btn-secondary btn-block" disabled={toggling} onClick={() => void toggleActive()}>
        {toggling ? 'Working…' : user.isActive ? 'Disable user' : 'Enable user'}
      </button>

      <p className="text-small-bold">Booking history</p>

      <div className="stack">
        {(bookings ?? []).map((booking) => (
          <Link key={booking.id} href={`/web/admin/bookings/${booking.id}`} className="card-link">
            <div className="card">
              <div className="card-header-row">
                <p className="text-small-bold">{booking.bookingNumber}</p>
                <p className="text-small-bold text-primary">{formatInr(booking.amountInPaise)}</p>
              </div>
              <p className="text-small text-secondary">
                {booking.vehicleNumber} · {booking.rateLabel}
              </p>
              <p className="text-small text-secondary">{formatIstDateTime(booking.startTime)}</p>
              <StatusPill status={booking.status} />
            </div>
          </Link>
        ))}
        {bookings !== null && bookings.length === 0 ? <div className="empty-state">No bookings yet.</div> : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
