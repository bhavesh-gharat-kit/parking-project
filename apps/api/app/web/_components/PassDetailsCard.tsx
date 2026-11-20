'use client';

import { useState, type FormEvent } from 'react';

import {
  PASS_HOLIDAY_OFF_DAYS,
  PASS_HOLIDAY_OFF_DAY_LABELS,
  PASS_OCCUPATION_CATEGORIES,
  PASS_OCCUPATION_CATEGORY_LABELS,
  PassDetailsUpdateRequestSchema,
  isPassAddressMissing,
  passDetailsEditScope,
  type PassBooking,
} from '@parking/shared';

import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';
import { Banner } from './Banner';
import { Field } from './Field';

type Props = {
  pass: PassBooking;
  /** Called with the saved pass so the page can replace its copy. */
  onSaved: (pass: PassBooking) => void;
};

const toForm = (p: PassBooking) => ({
  address: isPassAddressMissing(p.address) ? '' : p.address,
  occupationCategory: p.occupationCategory ?? '',
  occupationOther: p.occupationOther ?? '',
  holidayOffDay: p.holidayOffDay ?? '',
  holidayOffDayOther: p.holidayOffDayOther ?? '',
  helmet: p.helmet,
  locker: p.locker,
  airCheck: p.airCheck,
  rickshawParking: p.rickshawParking,
  expectedParkingDays: p.expectedParkingDays?.toString() ?? '',
  entryTime: p.entryTime ?? '',
  exitTime: p.exitTime ?? '',
});

/**
 * "Complete your pass details" (Phase 23). The pass flow files only the bare
 * minimum, so this lets the customer add the rest afterwards. What is editable
 * mirrors the server's `passDetailsEditScope`: address stays editable after
 * approval (it is printed on the pass), the informational fields only until then.
 * The server re-derives the scope from the stored status — this is just the UI.
 */
export function PassDetailsCard({ pass, onSaved }: Props) {
  const scope = passDetailsEditScope(pass.status);
  const addressMissing = isPassAddressMissing(pass.address);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => toForm(pass));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (scope === 'none') return null;
  const full = scope === 'all';

  const set =
    <K extends keyof typeof values>(key: K) =>
    (value: (typeof values)[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    // When only the address is editable, send only the address; the schema
    // defaults the rest and the server ignores them for this scope anyway.
    const input = full ? values : { address: values.address };
    const parsed = safeParseForm(PassDetailsUpdateRequestSchema, input);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const updated = await apiRequest<PassBooking>(`/api/passes/${pass.id}`, {
        method: 'PATCH',
        body: input,
      });
      onSaved(updated);
      setValues(toForm(updated));
      setSaved(true);
      setEditing(false);
    } catch (error) {
      setFormError(applyApiError(error, setErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (!editing) {
    return (
      <div className="stack">
        {addressMissing ? (
          <Banner kind="info">
            Add your address to complete this pass{full ? ' (and any other details you like)' : ''}.
          </Banner>
        ) : null}
        {saved ? <Banner kind="success">Details saved.</Banner> : null}
        <button
          type="button"
          className={`btn btn-block ${addressMissing ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setValues(toForm(pass));
            setEditing(true);
          }}
        >
          {addressMissing ? 'Complete pass details' : full ? 'Edit pass details' : 'Edit address'}
        </button>
      </div>
    );
  }

  return (
    <form className="card stack-loose" onSubmit={onSubmit} noValidate>
      <p className="text-small-bold">{full ? 'Pass details' : 'Address'}</p>
      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <Field label="Address" htmlFor="pd-address" error={errors.address} hint="Printed on your pass.">
        <textarea
          id="pd-address"
          className={`textarea${errors.address ? ' has-error' : ''}`}
          autoComplete="street-address"
          value={values.address}
          onChange={(e) => set('address')(e.target.value)}
        />
      </Field>

      {full ? (
        <>
          <Field label="Occupation" htmlFor="pd-occ" error={errors.occupationCategory}>
            <select
              id="pd-occ"
              className="select"
              value={values.occupationCategory}
              onChange={(e) => set('occupationCategory')(e.target.value)}
            >
              <option value="">Not specified</option>
              {PASS_OCCUPATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PASS_OCCUPATION_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          {values.occupationCategory === 'OTHER' ? (
            <Field label="Occupation (other)" htmlFor="pd-occ-other" error={errors.occupationOther}>
              <input
                id="pd-occ-other"
                className="input"
                value={values.occupationOther}
                onChange={(e) => set('occupationOther')(e.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Weekly off day" htmlFor="pd-off" error={errors.holidayOffDay}>
            <select
              id="pd-off"
              className="select"
              value={values.holidayOffDay}
              onChange={(e) => set('holidayOffDay')(e.target.value)}
            >
              <option value="">Not specified</option>
              {PASS_HOLIDAY_OFF_DAYS.map((d) => (
                <option key={d} value={d}>
                  {PASS_HOLIDAY_OFF_DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
          {values.holidayOffDay === 'OTHER' ? (
            <Field label="Off day (other)" htmlFor="pd-off-other" error={errors.holidayOffDayOther}>
              <input
                id="pd-off-other"
                className="input"
                value={values.holidayOffDayOther}
                onChange={(e) => set('holidayOffDayOther')(e.target.value)}
              />
            </Field>
          ) : null}

          <Field
            label="Days you expect to park this month"
            htmlFor="pd-days"
            error={errors.expectedParkingDays}
          >
            <input
              id="pd-days"
              className="input"
              inputMode="numeric"
              value={values.expectedParkingDays}
              onChange={(e) => set('expectedParkingDays')(e.target.value)}
            />
          </Field>

          <div className="btn-row">
            <Field label="Usual arrival" htmlFor="pd-in" error={errors.entryTime}>
              <input
                id="pd-in"
                type="time"
                className="input"
                value={values.entryTime}
                onChange={(e) => set('entryTime')(e.target.value)}
              />
            </Field>
            <Field label="Usual leaving" htmlFor="pd-out" error={errors.exitTime}>
              <input
                id="pd-out"
                type="time"
                className="input"
                value={values.exitTime}
                onChange={(e) => set('exitTime')(e.target.value)}
              />
            </Field>
          </div>

          <div className="stack">
            <span className="field-label">Also needed</span>
            {(
              [
                ['helmet', 'Helmet'],
                ['locker', 'Locker'],
                ['airCheck', 'Air check'],
                ['rickshawParking', 'Rickshaw parking'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  checked={values[key]}
                  onChange={(e) => set(key)(e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="text-small text-secondary">
          Your pass is approved, so only the address can be changed now.
        </p>
      )}

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
