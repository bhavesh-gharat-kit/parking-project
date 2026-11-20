'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { FieldErrors } from '../_lib/validation';
import '../_lib/portal-theme.css';
import { PasswordInput } from '../_components/PasswordInput';

const EMPTY = { email: '', password: '' };

export default function SignInPage() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!values.email.trim()) errors.email = 'Enter your email or mobile number';
    if (!values.password) errors.password = 'Enter your password';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const result = await signIn('credentials', {
        // The provider accepts an email address or a mobile number here.
        email: values.email.trim(),
        password: values.password,
        redirect: false,
      });

      if (!result || result.error) {
        setFormError('Incorrect email/mobile or password.');
        return;
      }

      router.push('/web');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal">
      <header className="pp-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ke-logo-sm.png" alt="Kumar Enterprises" className="pp-logo" />
        <div>
          <div className="pp-title">Kumar Enterprises — Parking</div>
          <div className="pp-sub">Kalyan · Two-Wheeler Pass</div>
        </div>
      </header>

      <main className="pp-container">
        <h1 className="pp-h1">Log in</h1>
        <p className="pp-lead">Enter your email or mobile number and password.</p>

        {formError ? <div className="pp-alert pp-alert-bad">{formError}</div> : null}

        <form onSubmit={onSubmit} noValidate>
          <div className="pp-card">
            <div className="pp-field">
              <label className="pp-label" htmlFor="email">Email or mobile number</label>
              <input
                id="email"
                type="text"
                className="pp-input"
                placeholder="you@example.com or 10-digit mobile"
                autoComplete="username"
                value={values.email}
                onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
              />
              {fieldErrors.email && <p className="pp-error">{fieldErrors.email}</p>}
            </div>

            <div className="pp-field" style={{ marginBottom: 0 }}>
              <label className="pp-label" htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                className="pp-input"
                placeholder="Your password"
                autoComplete="current-password"
                value={values.password}
                onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
              />
              {fieldErrors.password && <p className="pp-error">{fieldErrors.password}</p>}
            </div>
          </div>

          <div className="pp-mt">
            <button type="submit" className="pp-btn pp-btn-primary pp-btn-block" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Log in'}
            </button>
          </div>
        </form>

        <p className="pp-center pp-mt">
          <Link href="/web/forgot-password" className="pp-link pp-small">Forgot your password?</Link>
        </p>

        <p className="pp-small pp-muted pp-center pp-mt">
          New here? <Link href="/web/pass" className="pp-link">Apply for a pass</Link>
        </p>
      </main>
    </div>
  );
}
