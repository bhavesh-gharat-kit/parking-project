'use client';

import { useState, type FormEvent } from 'react';

import {
  ChangePasswordFormSchema,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
} from '@parking/shared';

import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';
import { Banner } from './Banner';
import { Field } from './Field';

const EMPTY = { currentPassword: '', newPassword: '', confirmNewPassword: '' };

export function ChangePasswordCard() {
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setChanged(false);

    const parsed = safeParseForm(ChangePasswordFormSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const body: ChangePasswordRequest = {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    };

    try {
      await apiRequest<ChangePasswordResponse>('/api/profile/change-password', {
        method: 'POST',
        body,
      });
      setValues(EMPTY);
      setChanged(true);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <p className="text-small-bold">Change password</p>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}
      {changed ? <Banner kind="success">Password changed. Use the new one next time you sign in.</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Current password" htmlFor="currentPassword" error={fieldErrors.currentPassword}>
          <input
            id="currentPassword"
            type="password"
            className={`input${fieldErrors.currentPassword ? ' has-error' : ''}`}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={set('currentPassword')}
          />
        </Field>

        <Field label="New password" htmlFor="newPassword" error={fieldErrors.newPassword}>
          <input
            id="newPassword"
            type="password"
            className={`input${fieldErrors.newPassword ? ' has-error' : ''}`}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={set('newPassword')}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="confirmNewPassword" error={fieldErrors.confirmNewPassword}>
          <input
            id="confirmNewPassword"
            type="password"
            className={`input${fieldErrors.confirmNewPassword ? ' has-error' : ''}`}
            autoComplete="new-password"
            value={values.confirmNewPassword}
            onChange={set('confirmNewPassword')}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Changing…' : 'Change password'}
        </button>
      </form>

      <p className="text-small text-secondary">
        You stay signed in on this device. Sessions already open on other devices are not signed
        out.
      </p>
    </div>
  );
}
