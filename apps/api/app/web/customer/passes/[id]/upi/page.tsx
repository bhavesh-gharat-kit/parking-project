'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { BookingUtrSubmitRequestSchema, formatInr, type PassBooking } from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { Field } from '../../../../_components/Field';
import { apiRequest, errorMessage } from '../../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../../_lib/validation';

export default function PassUpiPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [passBooking, setPassBooking] = useState<PassBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [havePaid, setHavePaid] = useState(false);

  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [utr, setUtr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiRequest<PassBooking>(`/api/passes/${id}`);
      setPassBooking(data);
      if (data.status !== 'PENDING_PAYMENT') router.replace(`/web/customer/passes/${id}`);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this pass application.'));
    }
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; redirects out of PENDING_PAYMENT state too
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setScreenshot(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(BookingUtrSubmitRequestSchema, { utr });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});

    if (!screenshot) {
      setFormError('Attach a screenshot of your payment confirmation to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('screenshot', screenshot);
      if (parsed.data.utr) form.set('utr', parsed.data.utr);

      await apiRequest<PassBooking>(`/api/passes/${id}/utr`, { method: 'POST', body: form });
      router.replace(`/web/customer/passes/${id}`);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
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

  const vpa = passBooking.payment?.upiPayeeVpa ?? null;
  const qrImageUrl = passBooking.location.upiQrImageUrl;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Pay via UPI</h1>

      <div className="card">
        <p className="text-small text-secondary">Amount</p>
        <p className="text-subtitle">{formatInr(passBooking.amountInPaise)}</p>
      </div>

      {qrImageUrl ? (
        <div className="qr-wrap">
          {/* Admin-supplied external image URL — unoptimized, same as the
              daily-booking UPI screen. */}
          <Image src={qrImageUrl} alt="UPI QR code" width={240} height={240} className="qr-image" unoptimized />
        </div>
      ) : (
        <Banner kind="info">
          QR code not available for this location. Use the UPI ID below, or ask staff at the
          parking location.
        </Banner>
      )}

      {vpa ? (
        <div className="card">
          <p className="text-small text-secondary">Pay to UPI ID</p>
          <p className="text-small-bold">{vpa}</p>
        </div>
      ) : null}

      {!havePaid ? (
        <button type="button" className="btn btn-primary btn-block" onClick={() => setHavePaid(true)}>
          I have paid
        </button>
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <p className="text-small text-secondary">
            Attach a screenshot of your payment confirmation. We will verify it against our bank
            statement before confirming your pass — this does not confirm it immediately.
          </p>

          {formError ? <Banner kind="danger">{formError}</Banner> : null}

          <Field label="Payment screenshot" htmlFor="screenshot" error={fieldErrors.screenshot}>
            {previewUrl ? (
              <div className="stack">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview URL, not an optimizable remote image */}
                <img src={previewUrl} alt="Payment screenshot preview" className="screenshot-preview" />
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Change screenshot
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
                Attach screenshot
              </button>
            )}
            <input
              ref={fileInputRef}
              id="screenshot"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              style={{ display: 'none' }}
            />
          </Field>

          <Field label="UPI reference / UTR (optional)" htmlFor="utr" error={fieldErrors.utr}>
            <input
              id="utr"
              className={`input${fieldErrors.utr ? ' has-error' : ''}`}
              placeholder="e.g. 123456789012"
              value={utr}
              onChange={(event) => setUtr(event.target.value)}
            />
          </Field>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !screenshot}>
            {submitting ? 'Submitting…' : 'Submit for verification'}
          </button>
        </form>
      )}
    </div>
  );
}
