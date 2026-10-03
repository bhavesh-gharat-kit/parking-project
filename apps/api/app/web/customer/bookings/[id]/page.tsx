'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatCountdown,
  formatInr,
  formatIstDateTime,
  isCustomerCancellable,
  isReceiptEligible,
  isTerminalBookingStatus,
  type Booking,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { StatusPill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';

type Row = { label: string; value: string };

export default function BookingSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setBooking(await apiRequest<Booking>(`/api/bookings/${id}`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this booking.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const expiresAt = booking?.expiresAt ? new Date(booking.expiresAt).getTime() : null;
  const countdownRunning = expiresAt !== null && !isTerminalBookingStatus(booking?.status ?? 'PENDING');
  const pastDeadline = expiresAt !== null && now >= expiresAt;

  useEffect(() => {
    if (!countdownRunning) return;
    const timer = setInterval(
      () => {
        if (pastDeadline) void load();
        else setNow(Date.now());
      },
      pastDeadline ? 15_000 : 1000,
    );
    return () => clearInterval(timer);
  }, [countdownRunning, pastDeadline, load]);

  const cancelBooking = async () => {
    if (!confirm('Cancel this parking booking?')) return;
    setCancelling(true);
    try {
      setBooking(await apiRequest<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST', body: {} }));
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
      void load();
    } finally {
      setCancelling(false);
    }
  };

  if (booking === null) {
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

  const remaining = expiresAt === null ? null : expiresAt - now;

  const rows: Row[] = [
    { label: 'Location', value: `${booking.location.name}, ${booking.location.city}` },
    { label: 'Address', value: booking.location.addressLine },
    { label: 'Vehicle', value: booking.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[booking.vehicleType] },
    { label: 'Package', value: booking.rateLabel },
    { label: 'Starts', value: formatIstDateTime(booking.startTime) },
    { label: 'Ends', value: formatIstDateTime(booking.endTime) },
    { label: 'Amount', value: formatInr(booking.amountInPaise) },
    {
      label: 'Payment method',
      value: booking.paymentMethod ? PAYMENT_METHOD_LABELS[booking.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      value: booking.payment ? PAYMENT_STATUS_LABELS[booking.payment.status] : 'Not started',
    },
    ...(booking.payment?.upiUtr ? [{ label: 'UPI reference', value: booking.payment.upiUtr }] : []),
    ...(booking.reviewNote ? [{ label: 'Note from parking', value: booking.reviewNote }] : []),
  ];

  return (
    <div className="stack-loose">
      <div className="card">
        <p className="text-small text-secondary">Booking number</p>
        <p className="text-subtitle">{booking.bookingNumber}</p>
        <StatusPill status={booking.status} large />
      </div>

      {countdownRunning && remaining !== null ? (
        <Banner kind="info">
          {remaining > 0
            ? `Complete this booking within ${formatCountdown(remaining)} or it will expire.`
            : 'This booking has passed its time limit and will expire shortly.'}
        </Banner>
      ) : null}

      <div className="card card-flush">
        {rows.map((row, index) => (
          <div className="card-row" key={row.label} style={index === 0 ? { borderTop: 'none' } : undefined}>
            <span className="card-row-label">{row.label}</span>
            <span className="card-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {booking.status === 'PENDING' ? (
        <Link href={`/web/customer/bookings/${booking.id}/payment`} className="btn btn-primary btn-block">
          Choose payment method
        </Link>
      ) : null}

      {booking.status === 'PENDING_PAYMENT' ? (
        <>
          <p className="text-small text-secondary">
            Scan the QR, pay the amount, then submit your UPI reference (UTR) so we can verify it.
          </p>
          <Link href={`/web/customer/bookings/${booking.id}/upi`} className="btn btn-primary btn-block">
            Pay via UPI
          </Link>
        </>
      ) : null}

      {booking.status === 'PAYMENT_VERIFICATION' ? (
        <p className="text-small text-secondary">
          We&apos;ve received your UPI reference and are checking it against our bank statement.
          This is not yet confirmed — refresh for updates.
        </p>
      ) : null}

      {booking.status === 'PENDING_APPROVAL' ? (
        <p className="text-small text-secondary">
          Pay the amount in cash at the parking location. An admin will confirm your booking once
          payment is received.
        </p>
      ) : null}

      {isReceiptEligible(booking.status) ? (
        <Link href={`/web/customer/bookings/${booking.id}/receipt`} className="btn btn-primary btn-block">
          View receipt
        </Link>
      ) : null}

      {isCustomerCancellable(booking.status) ? (
        <button type="button" className="btn btn-secondary btn-block" disabled={cancelling} onClick={() => void cancelBooking()}>
          {cancelling ? 'Cancelling…' : 'Cancel booking'}
        </button>
      ) : null}

      <button type="button" className="btn btn-ghost" onClick={() => router.replace('/web/customer/bookings')}>
        ← My bookings
      </button>
    </div>
  );
}
