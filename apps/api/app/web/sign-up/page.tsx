'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { RegisterRequestSchema, type AuthSession } from '@parking/shared';

import { Banner } from '../_components/Banner';
import { Field } from '../_components/Field';
import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';

const EMPTY = { name: '', email: '', phone: '', password: '' };

export default function SignUpPage() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(RegisterRequestSchema, values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      // Creates the account via the same JSON endpoint the mobile app uses —
      // its returned Bearer token is discarded here, since the website
      // authenticates the browser through Auth.js's own cookie session below,
      // not a parallel token path.
      await apiRequest<AuthSession>('/api/auth/register', { method: 'POST', body: parsed.data });

      const result = await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        // The account exists at this point; a sign-in failure right after
        // registering is unexpected, so send them to sign in by hand.
        router.push('/web/sign-in');
        return;
      }

      router.push('/web');
      router.refresh();
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
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
        <h1 className="text-heading">Create account</h1>
        <p className="text-small text-secondary">
          You will need this to book parking and get your receipt.
        </p>
      </div>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <input
            id="name"
            className={`input${fieldErrors.name ? ' has-error' : ''}`}
            placeholder="Ramesh Patil"
            autoComplete="name"
            value={values.name}
            onChange={set('name')}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            className={`input${fieldErrors.email ? ' has-error' : ''}`}
            placeholder="you@example.com"
            autoComplete="email"
            value={values.email}
            onChange={set('email')}
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="phone"
          error={fieldErrors.phone}
          hint="Optional. Printed on your parking receipt."
        >
          <input
            id="phone"
            className={`input${fieldErrors.phone ? ' has-error' : ''}`}
            placeholder="98765 43210"
            autoComplete="tel"
            value={values.phone}
            onChange={set('phone')}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={fieldErrors.password}>
          <input
            id="password"
            type="password"
            className={`input${fieldErrors.password ? ' has-error' : ''}`}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={values.password}
            onChange={set('password')}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="auth-footer">
        <span className="text-small text-secondary">Already have an account?</span>
        <Link href="/web/sign-in" className="text-small text-primary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
