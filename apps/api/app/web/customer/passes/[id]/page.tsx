'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  PASS_VEHICLE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  formatCountdown,
  formatInr,
  formatIstDate,
  isPassExpired,
  type PassBooking,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { PassStatusPill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';

type Row = { label: string; value: string };

export default function PassSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [passBooking, setPassBooking] = useState<PassBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPassBooking(await apiRequest<PassBooking>(`/api/passes/${id}`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this pass application.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const expiresAt = passBooking?.expiresAt ? new Date(passBooking.expiresAt).getTime() : null;
  const countdownRunning =
    expiresAt !== null && (passBooking?.status === 'PENDING' || passBooking?.status === 'PENDING_PAYMENT');
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

  if (passBooking === null) {
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
  const expired = isPassExpired(passBooking.endDate);

  const rows: Row[] = [
    { label: 'Location', value: `${passBooking.location.name}, ${passBooking.location.city}` },
    { label: 'Address', value: passBooking.location.addressLine },
    { label: 'Vehicle number', value: passBooking.vehicleNumber },
    { label: 'Vehicle category', value: PASS_VEHICLE_CATEGORY_LABELS[passBooking.vehicleCategory] },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[passBooking.vehicleType] },
    { label: 'Shift', value: SHIFT_TYPE_LABELS[passBooking.shiftType] },
    { label: 'Plan', value: passBooking.planLabel },
    { label: 'Mobile number', value: passBooking.mobileNumber },
    { label: 'Valid from', value: formatIstDate(passBooking.startDate) },
    { label: 'Valid until', value: formatIstDate(passBooking.endDate) },
    { label: 'Amount', value: formatInr(passBooking.amountInPaise) },
    {
      label: 'Payment method',
      value: passBooking.paymentMethod ? PAYMENT_METHOD_LABELS[passBooking.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      value: passBooking.payment ? PAYMENT_STATUS_LABELS[passBooking.payment.status] : 'Not started',
    },
    ...(passBooking.payment?.upiUtr ? [{ label: 'UPI reference', value: passBooking.payment.upiUtr }] : []),
    ...(passBooking.reviewNote ? [{ label: 'Note from parking', value: passBooking.reviewNote }] : []),
  ];

  return (
    <div className="stack-loose">
      <div className="card">
        <p className="text-small text-secondary">Pass number</p>
        <p className="text-subtitle">{passBooking.passNumber}</p>
        <div className="card-header-row">
          <PassStatusPill status={passBooking.status} large />
          {passBooking.status === 'CONFIRMED' ? (
            <span className={`pill ${expired ? 'pill-bad' : 'pill-done'}`}>
              {expired ? 'Expired' : 'Active'}
            </span>
          ) : null}
        </div>
      </div>

      {countdownRunning && remaining !== null ? (
        <Banner kind="info">
          {remaining > 0
            ? `Complete this application within ${formatCountdown(remaining)} or it will be cancelled.`
            : 'This application has passed its time limit and will be cancelled shortly.'}
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

      {passBooking.status === 'PENDING' ? (
        <Link href={`/web/customer/passes/${passBooking.id}/payment`} className="btn btn-primary btn-block">
          Choose payment method
        </Link>
      ) : null}

      {passBooking.status === 'PENDING_PAYMENT' ? (
        <>
          <p className="text-small text-secondary">
            Scan the QR, pay the amount, then submit your UPI reference (UTR) so we can verify it.
          </p>
          <Link href={`/web/customer/passes/${passBooking.id}/upi`} className="btn btn-primary btn-block">
            Pay via UPI
          </Link>
          <Link href={`/web/customer/passes/${passBooking.id}/payment`} className="btn btn-secondary btn-block">
            Change payment method
          </Link>
        </>
      ) : null}

      {passBooking.status === 'PAYMENT_VERIFICATION' ? (
        <p className="text-small text-secondary">
          We&apos;ve received your UPI reference and are checking it against our bank statement.
          This is not yet confirmed — refresh for updates.
        </p>
      ) : null}

      {passBooking.status === 'PENDING_APPROVAL' ? (
        <>
          <p className="text-small text-secondary">
            Pay the amount in cash at the parking location. An admin will confirm your pass once
            payment is received.
          </p>
          <Link href={`/web/customer/passes/${passBooking.id}/payment`} className="btn btn-secondary btn-block">
            Change payment method
          </Link>
        </>
      ) : null}

      <button type="button" className="btn btn-ghost" onClick={() => router.replace('/web/customer/passes')}>
        ← My passes
      </button>
    </div>
  );
}
