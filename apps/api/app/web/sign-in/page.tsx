'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { LoginRequestSchema } from '@parking/shared';

import { Banner } from '../_components/Banner';
import { Field } from '../_components/Field';
import { safeParseForm, type FieldErrors } from '../_lib/validation';

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

    const parsed = safeParseForm(LoginRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        setFormError('Incorrect email or password.');
        return;
      }

      router.push('/web');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-brand">
        <Image
          src="/brand/ke-logo.png"
          alt="Pay & Park logo"
          width={480}
          height={387}
          className="auth-brand-logo"
          priority
        />
        <span className="auth-brand-text">Pay &amp; Park</span>
      </div>

      <div className="auth-header">
        <h1 className="text-heading">Welcome back</h1>
        <p className="text-small text-secondary">Sign in to book parking and see your bookings.</p>
      </div>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            className={`input${fieldErrors.email ? ' has-error' : ''}`}
            placeholder="you@example.com"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={fieldErrors.password}>
          <input
            id="password"
            type="password"
            className={`input${fieldErrors.password ? ' has-error' : ''}`}
            placeholder="Your password"
            autoComplete="current-password"
            value={values.password}
            onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <Link href="/web/forgot-password" className="text-small text-primary text-center">
        Forgot your password?
      </Link>

      <div className="auth-footer">
        <span className="text-small text-secondary">New here?</span>
        <Link href="/web/sign-up" className="text-small text-primary">
          Create an account
        </Link>
      </div>
    </main>
  );
}
