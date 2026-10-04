'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  PASS_VEHICLE_CATEGORIES,
  PASS_VEHICLE_CATEGORY_LABELS,
  PassCreateRequestSchema,
  formatInr,
  type PassBooking,
  type PassPlan,
  type PassVehicleCategory,
  type ProfileResponse,
  type VehicleType,
} from '@parking/shared';

import { Banner } from '../../../../../_components/Banner';
import { Field } from '../../../../../_components/Field';
import { apiRequest } from '../../../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../../../_lib/validation';

const EMPTY = {
  vehicleNumber: '',
  vehicleCategory: null as PassVehicleCategory | null,
  mobileNumber: '',
  address: '',
  occupationCategory: '',
  holidayOffDay: '',
  helmet: false,
  locker: false,
  airCheck: false,
  rickshawParking: false,
  renewalReference: '',
};

export default function NewPassDetailsPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const passPlanId = searchParams.get('passPlanId');
  const vehicleType = searchParams.get('vehicleType') as VehicleType | null;

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plan, setPlan] = useState<PassPlan | null>(null);

  // Just for the review card below — the plan itself is re-resolved
  // server-side at submission (D5 point 2), never trusted from this fetch.
  useEffect(() => {
    if (!vehicleType) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await apiRequest<PassPlan[]>(
          `/api/locations/${locationId}/pass-plans?vehicleType=${vehicleType}`,
        );
        if (!cancelled) setPlan(items.find((item) => item.id === passPlanId) ?? null);
      } catch {
        // Non-fatal — the review card just omits the plan summary.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, vehicleType, passPlanId]);

  // Convenience pre-fill only (D5 point 1) — the field stays freely editable
  // and is never validated against the profile value.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await apiRequest<ProfileResponse>('/api/profile');
        if (!cancelled && profile.user.phone) {
          setValues((current) => (current.mobileNumber ? current : { ...current, mobileNumber: profile.user.phone ?? '' }));
        }
      } catch {
        // No profile phone to pre-fill with — the field just starts blank.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!passPlanId || !vehicleType) {
    return (
      <div className="stack-loose">
        <h1 className="text-heading">Pass details</h1>
        <p className="text-small text-secondary">Choose a plan first.</p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => router.replace(`/web/customer/passes/new/${locationId}`)}
        >
          Choose vehicle &amp; shift
        </button>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(PassCreateRequestSchema, {
      locationId,
      passPlanId,
      vehicleType,
      ...values,
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const passBooking = await apiRequest<PassBooking>('/api/passes', {
        method: 'POST',
        body: parsed.data,
      });
      router.replace(`/web/customer/passes/${passBooking.id}`);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Pass details</h1>
      <p className="text-small text-secondary">
        This is free text — it is not checked against your saved vehicles or profile.
      </p>

      {plan ? (
        <div className="card">
          <p className="text-small text-secondary">Plan</p>
          <p className="text-small-bold">{plan.label}</p>
          <p className="text-primary">{formatInr(plan.priceInPaise)}</p>
        </div>
      ) : null}

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Vehicle number" htmlFor="vehicleNumber" error={fieldErrors.vehicleNumber}>
          <input
            id="vehicleNumber"
            className={`input${fieldErrors.vehicleNumber ? ' has-error' : ''}`}
            placeholder="MH04AB1234"
            maxLength={10}
            value={values.vehicleNumber}
            onChange={(event) => setValues((current) => ({ ...current, vehicleNumber: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Vehicle category</span>
          <div className="chip-row">
            {PASS_VEHICLE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`chip${values.vehicleCategory === category ? ' selected' : ''}`}
                onClick={() => setValues((current) => ({ ...current, vehicleCategory: category }))}
              >
                {PASS_VEHICLE_CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
          {fieldErrors.vehicleCategory ? <span className="field-error">{fieldErrors.vehicleCategory}</span> : null}
        </div>

        <Field label="Mobile number" htmlFor="mobileNumber" error={fieldErrors.mobileNumber}>
          <input
            id="mobileNumber"
            className={`input${fieldErrors.mobileNumber ? ' has-error' : ''}`}
            placeholder="10-digit mobile number"
            value={values.mobileNumber}
            onChange={(event) => setValues((current) => ({ ...current, mobileNumber: event.target.value }))}
          />
        </Field>

        <Field label="Address" htmlFor="address" error={fieldErrors.address}>
          <textarea
            id="address"
            className={`textarea${fieldErrors.address ? ' has-error' : ''}`}
            value={values.address}
            onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))}
          />
        </Field>

        <Field
          label="Occupation (optional)"
          htmlFor="occupationCategory"
          error={fieldErrors.occupationCategory}
          hint="e.g. Lawyer, Servant, Devotee, Businessman, Senior Citizen"
        >
          <input
            id="occupationCategory"
            className={`input${fieldErrors.occupationCategory ? ' has-error' : ''}`}
            value={values.occupationCategory}
            onChange={(event) => setValues((current) => ({ ...current, occupationCategory: event.target.value }))}
          />
        </Field>

        <Field
          label="Weekly off day (optional)"
          htmlFor="holidayOffDay"
          error={fieldErrors.holidayOffDay}
        >
          <input
            id="holidayOffDay"
            className={`input${fieldErrors.holidayOffDay ? ' has-error' : ''}`}
            placeholder="e.g. Sunday"
            value={values.holidayOffDay}
            onChange={(event) => setValues((current) => ({ ...current, holidayOffDay: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Facilities (optional)</span>
          <div className="chip-row">
            {(
              [
                ['helmet', 'Helmet'],
                ['locker', 'Locker'],
                ['airCheck', 'Air Check'],
                ['rickshawParking', 'Rickshaw Parking'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip${values[key] ? ' selected' : ''}`}
                onClick={() => setValues((current) => ({ ...current, [key]: !current[key] }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Renewal reference (optional)"
          htmlFor="renewalReference"
          error={fieldErrors.renewalReference}
          hint="If you're renewing a prior pass, you can note its number here."
        >
          <input
            id="renewalReference"
            className={`input${fieldErrors.renewalReference ? ' has-error' : ''}`}
            value={values.renewalReference}
            onChange={(event) => setValues((current) => ({ ...current, renewalReference: event.target.value }))}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </div>
  );
}
