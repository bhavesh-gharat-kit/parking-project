'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { SetEmailRequestSchema, UpdateProfileRequestSchema, type ProfileResponse } from '@parking/shared';

import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';
import { Banner } from './Banner';
import { Field } from './Field';

/** Cleared on sign-out (NavBar) so the reminder returns on the next login. */
export const PROFILE_REMINDER_DISMISSED_KEY = 'pp-profile-reminder-dismissed';

type Props = {
  needsEmail: boolean;
  needsName: boolean;
  phone: string | null;
};

/**
 * "Complete your profile" reminder on customer Home. Decisions: the email (and a
 * missing name) is collected inline rather than routing to /profile, and the
 * dismissal lives in `sessionStorage` — gone when the tab closes or the user
 * signs out, so it reappears on the next login until the profile is complete.
 * The server decides whether to render this at all (role USER + incomplete).
 */
export function CompleteProfileModal({ needsEmail, needsName, phone }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(PROFILE_REMINDER_DISMISSED_KEY) === '1';
    } catch {
      /* storage blocked — just show it */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    if (!dismissed) setOpen(true);
  }, []);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(PROFILE_REMINDER_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const next: FieldErrors = {};
    let emailData: { email: string } | null = null;
    let nameData: { name: string; phone?: string | null } | null = null;

    if (needsEmail) {
      const parsed = safeParseForm(SetEmailRequestSchema, { email });
      if (parsed.ok) emailData = parsed.data;
      else Object.assign(next, parsed.errors);
    }
    if (needsName) {
      const parsed = safeParseForm(UpdateProfileRequestSchema, { name, phone: phone ?? undefined });
      if (parsed.ok) nameData = parsed.data;
      else Object.assign(next, parsed.errors);
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      if (nameData) await apiRequest<ProfileResponse>('/api/profile', { method: 'PATCH', body: nameData });
      if (emailData) await apiRequest<ProfileResponse>('/api/profile/email', { method: 'POST', body: emailData });
      setOpen(false);
      router.refresh(); // Home re-reads the row; a complete profile renders no modal
    } catch (error) {
      setFormError(applyApiError(error, setErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cp-title">
      <form className="modal stack-loose" onSubmit={onSubmit} noValidate>
        <div>
          <h2 id="cp-title" className="text-subtitle">Complete your profile</h2>
          <p className="text-small text-secondary">
            Add {[needsName && 'your name', needsEmail && 'a real email address'].filter(Boolean).join(' and ')} so
            we can send you receipts and updates about your pass.
          </p>
        </div>

        {formError ? <Banner kind="danger">{formError}</Banner> : null}

        {needsName ? (
          <Field label="Full name" htmlFor="cp-name" error={errors.name}>
            <input
              id="cp-name"
              className={`input${errors.name ? ' has-error' : ''}`}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        ) : null}

        {needsEmail ? (
          <Field label="Email address" htmlFor="cp-email" error={errors.email}>
            <input
              id="cp-email"
              type="email"
              className={`input${errors.email ? ' has-error' : ''}`}
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        ) : null}

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Complete now'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={dismiss} disabled={submitting}>
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}
