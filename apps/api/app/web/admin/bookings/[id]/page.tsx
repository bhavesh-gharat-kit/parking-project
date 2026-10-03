'use client';

import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type BookingStatus,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { StatusPill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';

type Row = { label: string; value: string };

function isActionable(status: BookingStatus): boolean {
  return status === 'PAYMENT_VERIFICATION' || status === 'PENDING_APPROVAL';
}

export default function AdminBookingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [booking, setBooking] = useState<AdminBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setBooking(await apiRequest<AdminBooking>(`/api/admin/bookings/${id}`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this booking.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const approve = async () => {
    const prompt =
      booking?.paymentMethod === 'UPI'
        ? 'Confirm you have checked the UTR against the bank statement, then approve.'
        : 'Confirm the cash has been received, then approve.';
    if (!confirm(prompt)) return;

    setApproving(true);
    try {
      setBooking(await apiRequest<AdminBooking>(`/api/admin/bookings/${id}/approve`, { method: 'POST', body: {} }));
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
      void load();
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    setRejecting(true);
    try {
      setBooking(
        await apiRequest<AdminBooking>(`/api/admin/bookings/${id}/reject`, {
          method: 'POST',
          body: { reason: reason.trim() || undefined },
        }),
      );
      setRejectMode(false);
      setReason('');
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
      void load();
    } finally {
      setRejecting(false);
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

  const rows: Row[] = [
    { label: 'Customer', value: booking.customer.name ?? '(no name on file)' },
    { label: 'Email', value: booking.customer.email },
    ...(booking.customer.phone ? [{ label: 'Phone', value: booking.customer.phone }] : []),
    { label: 'Location', value: booking.location.name },
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
    ...(booking.reviewNote ? [{ label: 'Review note', value: booking.reviewNote }] : []),
  ];

  return (
    <div className="stack-loose">
      <div className="card">
        <p className="text-small text-secondary">Booking number</p>
        <p className="text-subtitle">{booking.bookingNumber}</p>
        <StatusPill status={booking.status} large />
      </div>

      {booking.payment?.upiUtr || booking.payment?.utrScreenshotUrl ? (
        <div className="card" style={{ borderWidth: 2, borderColor: 'var(--color-primary)', borderStyle: 'solid' }}>
          <p className="text-small text-secondary">Payment evidence — check this against the bank statement</p>
          {booking.payment.upiUtr ? <p className="text-heading">{booking.payment.upiUtr}</p> : null}
          {booking.payment.utrScreenshotUrl ? (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <Image
                src={booking.payment.utrScreenshotUrl}
                alt="Payment screenshot"
                width={120}
                height={120}
                className="screenshot-preview"
                unoptimized
              />
              <p className="text-small text-secondary">Tap to view full size</p>
            </button>
          ) : null}
        </div>
      ) : null}

      {viewerOpen && booking.payment?.utrScreenshotUrl ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setViewerOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size modal view of an arbitrary uploaded image */}
          <img
            src={booking.payment.utrScreenshotUrl}
            alt="Payment screenshot full size"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        </div>
      ) : null}

      <div className="card card-flush">
        {rows.map((row, index) => (
          <div className="card-row" key={row.label} style={index === 0 ? { borderTop: 'none' } : undefined}>
            <span className="card-row-label">{row.label}</span>
            <span className="card-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {isActionable(booking.status) && !rejectMode ? (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={rejecting} onClick={() => void approve()}>
            {approving ? 'Approving…' : 'Approve'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={approving} onClick={() => setRejectMode(true)}>
            Reject
          </button>
        </div>
      ) : null}

      {rejectMode ? (
        <div className="card">
          <p className="text-small-bold">Reject this booking?</p>
          <p className="text-small text-secondary">The reason, if given, is shown to the customer.</p>
          <textarea
            className="textarea"
            placeholder="e.g. UTR does not match any received payment (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" disabled={rejecting} onClick={() => void reject()}>
              {rejecting ? 'Rejecting…' : 'Confirm rejection'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={rejecting}
              onClick={() => {
                setRejectMode(false);
                setReason('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
