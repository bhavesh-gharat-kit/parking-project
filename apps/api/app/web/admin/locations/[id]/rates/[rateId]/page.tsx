'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  formatDuration,
  paiseToRupees,
  ParkingRateRequestSchema,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type AdminParkingRate,
  type VehicleType,
} from '@parking/shared';

import { Banner } from '../../../../../_components/Banner';
import { Field } from '../../../../../_components/Field';
import { apiRequest, errorMessage } from '../../../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../../../_lib/validation';

const EMPTY = {
  vehicleType: 'CAR' as VehicleType,
  durationMinutes: '60',
  priceInRupees: '',
  sortOrder: '0',
  isActive: true,
};

export default function AdminRateFormPage() {
  const { id: locationId, rateId } = useParams<{ id: string; rateId: string }>();
  const router = useRouter();
  const isNew = rateId === 'new';

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        // There is no `GET /api/admin/locations/:id/rates/:rateId` (only
        // PATCH/DELETE exist on that route) — the list endpoint is the only
        // way to read one rate back, so fetch it and find the match.
        const rates = await apiRequest<AdminParkingRate[]>(`/api/admin/locations/${locationId}/rates`);
        const rate = rates.find((item) => item.id === rateId);
        if (!rate) throw new Error('Rate not found.');
        if (cancelled) return;
        setValues({
          vehicleType: rate.vehicleType,
          durationMinutes: String(rate.durationMinutes),
          priceInRupees: String(paiseToRupees(rate.priceInPaise)),
          sortOrder: String(rate.sortOrder),
          isActive: rate.isActive,
        });
      } catch (error) {
        if (!cancelled) setFormError(errorMessage(error, 'Could not load this rate.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, rateId, isNew]);

  const durationNumber = Number(values.durationMinutes);
  const durationPreview = durationNumber > 0 ? formatDuration(durationNumber) : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(ParkingRateRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      // Send the raw form `values`, not `parsed.data`: this schema's
      // `priceInRupees` has a `.transform()` to paise (see rates.ts), so
      // `parsed.data` is already post-transform. The backend runs the same
      // schema on the request body and transforms again — sending the
      // already-transformed value would multiply the price by 100.
      // `safeParseForm` above exists only to surface validation errors
      // before the round trip.
      if (isNew) {
        await apiRequest<AdminParkingRate>(`/api/admin/locations/${locationId}/rates`, { method: 'POST', body: values });
      } else {
        await apiRequest<AdminParkingRate>(`/api/admin/locations/${locationId}/rates/${rateId}`, { method: 'PATCH', body: values });
      }
      router.push(`/web/admin/locations/${locationId}/rates`);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-center">Loading…</div>;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">{isNew ? 'Add rate' : 'Edit rate'}</h1>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <span className="field-label">Vehicle type</span>
          <div className="chip-row">
            {VEHICLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`chip${values.vehicleType === type ? ' selected' : ''}`}
                onClick={() => setValues((current) => ({ ...current, vehicleType: type }))}
              >
                {VEHICLE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Duration (minutes)"
          htmlFor="durationMinutes"
          error={fieldErrors.durationMinutes}
          hint={durationPreview ? `Shown to customers as "${durationPreview}"` : 'e.g. 60, 120, 1440 (full day)'}
        >
          <input
            id="durationMinutes"
            type="number"
            className={`input${fieldErrors.durationMinutes ? ' has-error' : ''}`}
            placeholder="60"
            value={values.durationMinutes}
            onChange={(event) => setValues((current) => ({ ...current, durationMinutes: event.target.value }))}
          />
        </Field>

        <Field label="Price (₹)" htmlFor="priceInRupees" error={fieldErrors.priceInRupees}>
          <input
            id="priceInRupees"
            type="number"
            step="0.01"
            className={`input${fieldErrors.priceInRupees ? ' has-error' : ''}`}
            placeholder="70"
            value={values.priceInRupees}
            onChange={(event) => setValues((current) => ({ ...current, priceInRupees: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Status</span>
          <div className="chip-row">
            <button type="button" className={`chip${values.isActive ? ' selected' : ''}`} onClick={() => setValues((c) => ({ ...c, isActive: true }))}>
              Active
            </button>
            <button type="button" className={`chip${!values.isActive ? ' selected' : ''}`} onClick={() => setValues((c) => ({ ...c, isActive: false }))}>
              Retired
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Saving…' : isNew ? 'Add rate' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
