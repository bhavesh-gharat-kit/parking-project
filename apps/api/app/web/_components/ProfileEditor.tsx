'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  UpdateProfileRequestSchema,
  type ProfileResponse,
  type SessionUser,
} from '@parking/shared';

import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';
import { Banner } from './Banner';
import { ChangePasswordCard } from './ChangePasswordCard';
import { Field } from './Field';

type ProfileEditorProps = {
  /** Rendered below the forms — the screen's own extra navigation. */
  children?: ReactNode;
};

/**
 * Shared by `customer/profile` and `admin/profile` — both roles edit the same
 * row through the same `requireUser`-guarded `/api/profile` endpoint (mirrors
 * apps/mobile/src/components/profile-editor.tsx).
 */
export function ProfileEditor({ children }: ProfileEditorProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [values, setValues] = useState({ name: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const profile = await apiRequest<ProfileResponse>('/api/profile');
      setUser(profile.user);
      setHasPassword(profile.hasPassword);
      setValues({ name: profile.user.name ?? '', phone: profile.user.phone ?? '' });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your profile.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-focus/mount; the save handler re-reads the same stable callback outside an effect
    void load();
  }, [load]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    const parsed = safeParseForm(UpdateProfileRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const { user: updated, hasPassword: updatedHasPassword } = await apiRequest<ProfileResponse>(
        '/api/profile',
        { method: 'PATCH', body: parsed.data },
      );
      setUser(updated);
      setHasPassword(updatedHasPassword);
      setValues({ name: updated.name ?? '', phone: updated.phone ?? '' });
      setSaved(true);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Profile</h1>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}
      {saved ? <Banner kind="success">Saved.</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <span className="field-label">Email</span>
          <span className="text-secondary">{user?.email}</span>
        </div>

        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <input
            id="name"
            className={`input${fieldErrors.name ? ' has-error' : ''}`}
            placeholder="Ramesh Patil"
            autoComplete="name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="phone"
          error={fieldErrors.phone}
          hint="Printed on your parking receipt."
        >
          <input
            id="phone"
            className={`input${fieldErrors.phone ? ' has-error' : ''}`}
            placeholder="98765 43210"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="section-header">
        <p className="text-small-bold">Security</p>
        <p className="text-small text-secondary">Change your password or review how you sign in.</p>
      </div>

      {loadError && hasPassword === null ? (
        <div className="card">
          <p className="text-small-bold">Change password</p>
          <p className="text-small text-secondary">{loadError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : hasPassword === null ? (
        <div className="loading-center">Loading…</div>
      ) : hasPassword ? (
        <ChangePasswordCard />
      ) : (
        <div className="card">
          <p className="text-small-bold">You signed in with Google</p>
          <p className="text-small text-secondary">
            Your account has no password — keep using &quot;Sign in with Google&quot; on the app,
            and there is nothing here to change.
          </p>
        </div>
      )}

      {children ? (
        <div className="section-header">
          <p className="text-small-bold">More</p>
          <div className="stack" style={{ marginTop: 'var(--space-2)' }}>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
