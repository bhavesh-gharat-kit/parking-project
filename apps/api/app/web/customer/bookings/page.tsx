'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PAYMENT_STATUS_LABELS,
  formatInr,
  formatIstDateTime,
  isReceiptEligible,
  type Booking,
  type Paginated,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { StatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function BookingsListPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await apiRequest<Paginated<Booking>>('/api/bookings');
        if (!cancelled) setBookings(page.items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load your bookings.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">My bookings</h1>
        <Link href="/web/customer/book" className="btn btn-primary">
          Book parking
        </Link>
      </div>

      {bookings === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(bookings ?? []).map((booking) => (
            // A nested <a> inside <a> is invalid HTML (hydration error, and
            // the inner "View receipt" link becomes unclickable), so the
            // card-to-detail link and the receipt link are siblings here,
            // not parent/child, even though they sit inside one visual card.
            <div className="card" key={booking.id}>
              <Link href={`/web/customer/bookings/${booking.id}`} className="card-click-area">
                <div className="card-header-row">
                  <p className="text-small-bold">{booking.bookingNumber}</p>
                  <p className="text-small-bold text-primary">{formatInr(booking.amountInPaise)}</p>
                </div>
                <p className="text-small text-secondary">
                  {booking.location.name} · {booking.vehicleNumber} · {booking.rateLabel}
                </p>
                <p className="text-small text-secondary">{formatIstDateTime(booking.startTime)}</p>
                <div className="card-header-row">
                  <StatusPill status={booking.status} />
                  {booking.payment ? (
                    <span className="text-small text-secondary">
                      Payment: {PAYMENT_STATUS_LABELS[booking.payment.status]}
                    </span>
                  ) : null}
                </div>
              </Link>
              {isReceiptEligible(booking.status) ? (
                <Link href={`/web/customer/bookings/${booking.id}/receipt`} className="text-small text-primary">
                  View receipt
                </Link>
              ) : null}
            </div>
          ))}
          {bookings !== null && bookings.length === 0 ? (
            <div className="empty-state">No bookings yet. Book parking and it will show up here.</div>
          ) : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
