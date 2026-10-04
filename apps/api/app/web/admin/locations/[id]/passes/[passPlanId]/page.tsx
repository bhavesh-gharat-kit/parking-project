'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  paiseToRupees,
  PassPlanRequestSchema,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type AdminPassPlan,
  type ShiftType,
  type VehicleType,
} from '@parking/shared';

import { Banner } from '../../../../../_components/Banner';
import { Field } from '../../../../../_components/Field';
import { apiRequest, errorMessage } from '../../../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../../../_lib/validation';

const EMPTY = {
  vehicleType: 'CAR' as VehicleType,
  shiftType: 'DAY' as ShiftType,
  label: '',
  validityMonths: '1',
  priceInRupees: '',
  sortOrder: '0',
  isActive: true,
};

export default function AdminPassPlanFormPage() {
  const { id: locationId, passPlanId } = useParams<{ id: string; passPlanId: string }>();
  const router = useRouter();
  const isNew = passPlanId === 'new';

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
        // There is no `GET /api/admin/pass-plans/:id` (only PATCH/DELETE exist
        // on that route) — the list endpoint is the only way to read one plan
        // back, same pattern as the rates admin form.
        const plans = await apiRequest<AdminPassPlan[]>(`/api/admin/pass-plans?locationId=${locationId}`);
        const plan = plans.find((item) => item.id === passPlanId);
        if (!plan) throw new Error('Pass plan not found.');
        if (cancelled) return;
        setValues({
          vehicleType: plan.vehicleType,
          shiftType: plan.shiftType,
          label: plan.label,
          validityMonths: String(plan.validityMonths),
          priceInRupees: String(paiseToRupees(plan.priceInPaise)),
          sortOrder: String(plan.sortOrder),
          isActive: plan.isActive,
        });
      } catch (error) {
        if (!cancelled) setFormError(errorMessage(error, 'Could not load this pass plan.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, passPlanId, isNew]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(PassPlanRequestSchema, { ...values, locationId });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      // Send the raw form `values` plus `locationId`, not `parsed.data`: this
      // schema's `priceInRupees` has a `.transform()` to paise (see
      // passes.ts), so `parsed.data` is already post-transform. The backend
      // runs the same schema on the request body and transforms again —
      // sending the already-transformed value would multiply the price by
      // 100. `safeParseForm` above exists only to surface validation errors
      // before the round trip.
      const body = { ...values, locationId };
      if (isNew) {
        await apiRequest<AdminPassPlan>('/api/admin/pass-plans', { method: 'POST', body });
      } else {
        await apiRequest<AdminPassPlan>(`/api/admin/pass-plans/${passPlanId}`, { method: 'PATCH', body });
      }
      router.push(`/web/admin/locations/${locationId}/passes`);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-center">Loading…</div>;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">{isNew ? 'Add pass plan' : 'Edit pass plan'}</h1>

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

        <div className="field">
          <span className="field-label">Shift</span>
          <div className="chip-row">
            {SHIFT_TYPES.map((shift) => (
              <button
                key={shift}
                type="button"
                className={`chip${values.shiftType === shift ? ' selected' : ''}`}
                onClick={() => setValues((current) => ({ ...current, shiftType: shift }))}
              >
                {SHIFT_TYPE_LABELS[shift]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Label" htmlFor="label" error={fieldErrors.label} hint='e.g. "Weekly", "15-Day", "Monthly", "3-Month"'>
          <input
            id="label"
            className={`input${fieldErrors.label ? ' has-error' : ''}`}
            placeholder="Monthly"
            value={values.label}
            onChange={set('label')}
          />
        </Field>

        <Field
          label="Validity (months)"
          htmlFor="validityMonths"
          error={fieldErrors.validityMonths}
          hint="1 for a tier running to the end of the purchase month, 3 for a quarter, etc."
        >
          <input
            id="validityMonths"
            type="number"
            className={`input${fieldErrors.validityMonths ? ' has-error' : ''}`}
            placeholder="1"
            value={values.validityMonths}
            onChange={set('validityMonths')}
          />
        </Field>

        <Field label="Price (₹)" htmlFor="priceInRupees" error={fieldErrors.priceInRupees}>
          <input
            id="priceInRupees"
            type="number"
            step="0.01"
            className={`input${fieldErrors.priceInRupees ? ' has-error' : ''}`}
            placeholder="500"
            value={values.priceInRupees}
            onChange={set('priceInRupees')}
          />
        </Field>

        <Field label="Sort order" htmlFor="sortOrder" error={fieldErrors.sortOrder} hint="Display order in the customer's plan list (lower first).">
          <input
            id="sortOrder"
            type="number"
            className="input"
            placeholder="0"
            value={values.sortOrder}
            onChange={set('sortOrder')}
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
          {submitting ? 'Saving…' : isNew ? 'Add plan' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
