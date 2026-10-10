'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PAYMENT_METHOD_LABELS, formatInr, type PassBooking, type PaymentMethod } from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../../_lib/api';

const METHODS: { method: PaymentMethod; description: string }[] = [
  { method: 'UPI', description: 'Pay now by scanning a QR code with any UPI app.' },
  { method: 'CASH', description: 'Pay in cash when you arrive at the parking location.' },
];

export default function ChoosePassPaymentMethodPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [passBooking, setPassBooking] = useState<PassBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiRequest<PassBooking>(`/api/passes/${id}`);
      setPassBooking(data);
      // The method stays changeable through `PENDING_PAYMENT` (UPI, QR not
      // yet paid) and `PENDING_APPROVAL` (cash, not yet confirmed) — only
      // past that (a UTR submitted, or the application decided) is it locked.
      if (data.status !== 'PENDING' && data.status !== 'PENDING_PAYMENT' && data.status !== 'PENDING_APPROVAL') {
        router.replace(`/web/customer/passes/${id}`);
      } else {
        setSelected((current) => current ?? data.paymentMethod);
      }
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this pass application.'));
    }
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; redirects out of PENDING state too
    void load();
  }, [load]);

  const confirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest<PassBooking>(`/api/passes/${id}/payment-method`, {
        method: 'POST',
        body: { method: selected },
      });
      if (selected === 'UPI') {
        router.replace(`/web/customer/passes/${id}/upi`);
      } else {
        router.replace(`/web/customer/passes/${id}`);
      }
    } catch (error) {
      setSubmitError(errorMessage(error, 'Could not save your payment method. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

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

  const alreadyChosen = passBooking.paymentMethod !== null;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">{alreadyChosen ? 'Change payment method' : 'Choose payment method'}</h1>
      <p className="text-small text-secondary">Amount to pay: {formatInr(passBooking.amountInPaise)}</p>
      {alreadyChosen ? (
        <p className="text-small text-secondary">
          You can still switch methods — nothing is final until payment is verified.
        </p>
      ) : null}

      <div className="stack">
        {METHODS.map(({ method, description }) => (
          <button
            key={method}
            type="button"
            className="card-link"
            style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
            onClick={() => setSelected(method)}
          >
            <div className={`card${selected === method ? ' card-selected' : ''}`}>
              <p className="text-small-bold">{PAYMENT_METHOD_LABELS[method]}</p>
              <p className="text-small text-secondary">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {submitError ? <Banner kind="danger">{submitError}</Banner> : null}

      <button type="button" className="btn btn-primary btn-block" disabled={!selected || submitting} onClick={() => void confirm()}>
        {submitting
          ? 'Saving…'
          : selected
            ? `Continue with ${PAYMENT_METHOD_LABELS[selected]}`
            : 'Choose a payment method'}
      </button>
    </div>
  );
}
