'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ParkingLocationRequestSchema,
  type AdminParkingLocation,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Field } from '../../../_components/Field';
import { apiRequest, errorMessage } from '../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../_lib/validation';

const EMPTY = {
  name: '',
  code: '',
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
  contactPhone: '',
  capacity: '',
  isActive: true,
  upiVpa: '',
  upiQrImageUrl: '',
};

export default function AdminLocationFormPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const location = await apiRequest<AdminParkingLocation>(`/api/admin/locations/${id}`);
        if (cancelled) return;
        setValues({
          name: location.name,
          code: location.code,
          addressLine: location.addressLine,
          city: location.city,
          state: location.state,
          pincode: location.pincode ?? '',
          contactPhone: location.contactPhone ?? '',
          capacity: location.capacity == null ? '' : String(location.capacity),
          isActive: location.isActive,
          upiVpa: location.upiVpa ?? '',
          upiQrImageUrl: location.upiQrImageUrl ?? '',
        });
      } catch (error) {
        if (!cancelled) setFormError(errorMessage(error, 'Could not load this location.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(ParkingLocationRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isNew) {
        await apiRequest<AdminParkingLocation>('/api/admin/locations', { method: 'POST', body: parsed.data });
      } else {
        await apiRequest<AdminParkingLocation>(`/api/admin/locations/${id}`, { method: 'PATCH', body: parsed.data });
      }
      router.push('/web/admin/locations');
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-center">Loading…</div>;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">{isNew ? 'Add location' : 'Edit location'}</h1>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Location name" htmlFor="name" error={fieldErrors.name}>
          <input id="name" className={`input${fieldErrors.name ? ' has-error' : ''}`} placeholder="Kalyan" value={values.name} onChange={set('name')} />
        </Field>

        <Field label="Branch code" htmlFor="code" error={fieldErrors.code} hint="2-8 letters/numbers, used as the booking-number prefix.">
          <input id="code" className={`input${fieldErrors.code ? ' has-error' : ''}`} placeholder="KLY" value={values.code} onChange={set('code')} />
        </Field>

        <Field label="Address" htmlFor="addressLine" error={fieldErrors.addressLine}>
          <input
            id="addressLine"
            className={`input${fieldErrors.addressLine ? ' has-error' : ''}`}
            placeholder="Station Road, near Kalyan Railway Station"
            value={values.addressLine}
            onChange={set('addressLine')}
          />
        </Field>

        <Field label="City" htmlFor="city" error={fieldErrors.city}>
          <input id="city" className={`input${fieldErrors.city ? ' has-error' : ''}`} placeholder="Kalyan" value={values.city} onChange={set('city')} />
        </Field>

        <Field label="State" htmlFor="state" error={fieldErrors.state}>
          <input id="state" className={`input${fieldErrors.state ? ' has-error' : ''}`} placeholder="Maharashtra" value={values.state} onChange={set('state')} />
        </Field>

        <Field label="Pincode" htmlFor="pincode" error={fieldErrors.pincode} hint="Optional">
          <input id="pincode" className="input" placeholder="421301" value={values.pincode} onChange={set('pincode')} />
        </Field>

        <Field label="Contact number" htmlFor="contactPhone" error={fieldErrors.contactPhone} hint="Optional">
          <input id="contactPhone" className="input" placeholder="98765 43210" value={values.contactPhone} onChange={set('contactPhone')} />
        </Field>

        <Field label="Capacity" htmlFor="capacity" error={fieldErrors.capacity} hint="Optional headcount, shown on the admin dashboard.">
          <input id="capacity" type="number" className="input" placeholder="e.g. 50" value={values.capacity} onChange={set('capacity')} />
        </Field>

        <div className="section-header">
          <p className="text-small-bold">UPI payment</p>
        </div>

        <Field label="UPI ID" htmlFor="upiVpa" error={fieldErrors.upiVpa} hint="Optional — shown on the customer's UPI payment screen.">
          <input id="upiVpa" className="input" placeholder="business@okhdfcbank" value={values.upiVpa} onChange={set('upiVpa')} />
        </Field>

        <Field
          label="UPI QR code image URL"
          htmlFor="upiQrImageUrl"
          error={fieldErrors.upiQrImageUrl}
          hint="Optional — a static QR image the app/website displays for UPI payment."
        >
          <input id="upiQrImageUrl" className="input" placeholder="https://example.com/kalyan-upi-qr.png" value={values.upiQrImageUrl} onChange={set('upiQrImageUrl')} />
        </Field>

        <div className="field">
          <span className="field-label">Status</span>
          <div className="chip-row">
            <button type="button" className={`chip${values.isActive ? ' selected' : ''}`} onClick={() => setValues((c) => ({ ...c, isActive: true }))}>
              Active
            </button>
            <button type="button" className={`chip${!values.isActive ? ' selected' : ''}`} onClick={() => setValues((c) => ({ ...c, isActive: false }))}>
              Inactive
            </button>
          </div>
          <span className="field-hint">Inactive locations no longer appear in the customer app/website.</span>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Saving…' : isNew ? 'Add location' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
