'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, VehicleRequestSchema, type Vehicle, type VehicleType } from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Field } from '../../../_components/Field';
import { apiRequest, errorMessage } from '../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../_lib/validation';

const EMPTY = { number: '', type: 'CAR' as VehicleType, makeModel: '' };

export default function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

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
        const vehicle = await apiRequest<Vehicle>(`/api/vehicles/${id}`);
        if (cancelled) return;
        setValues({ number: vehicle.number, type: vehicle.type, makeModel: vehicle.makeModel ?? '' });
      } catch (error) {
        if (!cancelled) setFormError(errorMessage(error, 'Could not load this vehicle.'));
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

    const parsed = safeParseForm(VehicleRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isNew) {
        await apiRequest<Vehicle>('/api/vehicles', { method: 'POST', body: parsed.data });
      } else {
        await apiRequest<Vehicle>(`/api/vehicles/${id}`, { method: 'PATCH', body: parsed.data });
      }
      router.push('/web/customer/vehicles');
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-center">Loading…</div>;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">{isNew ? 'Add vehicle' : 'Edit vehicle'}</h1>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Vehicle number" htmlFor="number" error={fieldErrors.number}>
          <input
            id="number"
            className={`input${fieldErrors.number ? ' has-error' : ''}`}
            placeholder="MH04AB1234"
            value={values.number}
            onChange={(event) => setValues((current) => ({ ...current, number: event.target.value }))}
          />
        </Field>

        <Field
          label="Make / model"
          htmlFor="makeModel"
          error={fieldErrors.makeModel}
          hint="Optional — helps tell two vehicles apart."
        >
          <input
            id="makeModel"
            className={`input${fieldErrors.makeModel ? ' has-error' : ''}`}
            placeholder="Honda Activa"
            value={values.makeModel}
            onChange={(event) => setValues((current) => ({ ...current, makeModel: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Vehicle type</span>
          <div className="chip-row">
            {VEHICLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`chip${values.type === type ? ' selected' : ''}`}
                onClick={() => setValues((current) => ({ ...current, type }))}
              >
                {VEHICLE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Saving…' : isNew ? 'Add vehicle' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
