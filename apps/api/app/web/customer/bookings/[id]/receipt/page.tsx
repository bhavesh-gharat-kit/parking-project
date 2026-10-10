'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstDateTime,
  type Receipt,
} from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { PaymentStatusPill, StatusPill } from '../../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../../_lib/api';

type Row = { label: string; value: string };

function RowsCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="section-header">
      <p className="text-small-bold">{title}</p>
      <div className="card card-flush">
        {rows.map((row, index) => (
          <div className="card-row" key={row.label} style={index === 0 ? { borderTop: 'none' } : undefined}>
            <span className="card-row-label">{row.label}</span>
            <span className="card-row-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setReceipt(await apiRequest<Receipt>(`/api/bookings/${id}/receipt`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this receipt.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  if (receipt === null) {
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

  const watermarked = receipt.paymentStatus === 'PAID';

  const locationRows: Row[] = [
    { label: 'Location', value: `${receipt.location.name}, ${receipt.location.city}` },
    { label: 'Address', value: receipt.location.addressLine },
  ];

  const customerRows: Row[] = [
    { label: 'Customer', value: receipt.customer.name ?? receipt.customer.email },
    ...(receipt.customer.phone ? [{ label: 'Contact', value: receipt.customer.phone }] : []),
    { label: 'Vehicle number', value: receipt.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[receipt.vehicleType] },
  ];

  const bookingRows: Row[] = [
    { label: 'Booking date', value: formatIstDate(receipt.bookingDate) },
    { label: 'Entry time', value: formatIstDateTime(receipt.startTime) },
    { label: 'Valid until', value: formatIstDateTime(receipt.endTime) },
    { label: 'Package', value: receipt.rateLabel },
  ];

  const paymentRows: Row[] = [
    { label: 'Amount', value: formatInr(receipt.amountInPaise) },
    {
      label: 'Payment method',
      value: receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : 'Not chosen yet',
    },
  ];

  return (
    <div className="watermark-wrap">
      {watermarked ? <div className="watermark-stamp">PAID</div> : null}

      <div className="watermark-content">
        <div className="card">
          <p className="text-small text-secondary">Booking number</p>
          <p className="text-subtitle text-primary">{receipt.bookingNumber}</p>
          <StatusPill status={receipt.status} large />
        </div>

        <RowsCard title="Location" rows={locationRows} />
        <RowsCard title="Customer & vehicle" rows={customerRows} />
        <RowsCard title="Booking" rows={bookingRows} />

        <div className="section-header">
          <p className="text-small-bold">Payment</p>
          <div className="card card-flush">
            {paymentRows.map((row, index) => (
              <div className="card-row" key={row.label} style={index === 0 ? { borderTop: 'none' } : undefined}>
                <span className="card-row-label">{row.label}</span>
                <span className="card-row-value">{row.value}</span>
              </div>
            ))}
            <div className="card-row">
              <span className="card-row-label">Payment status</span>
              <span className="card-row-value">
                {receipt.paymentStatus ? <PaymentStatusPill status={receipt.paymentStatus} /> : 'Not started'}
              </span>
            </div>
          </div>
        </div>

        {receipt.business.supportPhone ? (
          <p className="text-small text-secondary text-center">Support: {receipt.business.supportPhone}</p>
        ) : null}

        <button type="button" className="btn btn-secondary btn-block no-print" onClick={() => window.print()}>
          Download / print PDF
        </button>
      </div>
    </div>
  );
}
