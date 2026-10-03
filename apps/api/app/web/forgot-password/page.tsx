'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ForgotPasswordRequestOtpRequestSchema,
  ForgotPasswordResetFormSchema,
  OTP_RESEND_COOLDOWN_SECONDS,
  type ForgotPasswordRequestOtpResponse,
  type ForgotPasswordVerifyOtpResponse,
} from '@parking/shared';

import { Banner } from '../_components/Banner';
import { Field } from '../_components/Field';
import { apiRequest } from '../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../_lib/validation';

const EMPTY_RESET = { otp: '', newPassword: '', confirmNewPassword: '' };

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const [email, setEmail] = useState('');
  const [emailErrors, setEmailErrors] = useState<FieldErrors>({});
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);

  const [resetValues, setResetValues] = useState(EMPTY_RESET);
  const [resetErrors, setResetErrors] = useState<FieldErrors>({});
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const requestCode = async (address: string) => {
    await apiRequest<ForgotPasswordRequestOtpResponse>('/api/auth/forgot-password/request-otp', {
      method: 'POST',
      body: { email: address },
    });
  };

  const onRequestCode = async (event: FormEvent) => {
    event.preventDefault();
    setEmailError(null);

    const parsed = safeParseForm(ForgotPasswordRequestOtpRequestSchema, { email });
    if (!parsed.ok) {
      setEmailErrors(parsed.errors);
      return;
    }
    setEmailErrors({});
    setSendingCode(true);

    try {
      await requestCode(parsed.data.email);
      setSentTo(parsed.data.email);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setEmailError(applyApiError(error, setEmailErrors));
    } finally {
      setSendingCode(false);
    }
  };

  const onResend = async () => {
    if (!sentTo || cooldown > 0 || resending) return;
    setResetError(null);
    setResending(true);
    try {
      await requestCode(sentTo);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setResetValues((current) => ({ ...current, otp: '' }));
    } catch (error) {
      setResetError(applyApiError(error, setResetErrors));
    } finally {
      setResending(false);
    }
  };

  const onReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setResetError(null);

    const parsed = safeParseForm(ForgotPasswordResetFormSchema, resetValues);
    if (!parsed.ok) {
      setResetErrors(parsed.errors);
      return;
    }
    setResetErrors({});
    setResetSubmitting(true);

    try {
      await apiRequest<ForgotPasswordVerifyOtpResponse>('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        body: { email: sentTo, otp: parsed.data.otp, newPassword: parsed.data.newPassword },
      });
      setResetValues(EMPTY_RESET);
      setResetDone(true);
    } catch (error) {
      setResetError(applyApiError(error, setResetErrors));
    } finally {
      setResetSubmitting(false);
    }
  };

  const startOver = () => {
    setSentTo(null);
    setResetError(null);
    setEmailError(null);
    setCooldown(0);
    setResetValues(EMPTY_RESET);
  };

  if (resetDone) {
    return (
      <main className="auth-shell">
        <div className="auth-brand">Pay &amp; Park</div>
        <div className="auth-header">
          <h1 className="text-heading">Password updated</h1>
          <p className="text-small text-secondary">Sign in with your new password.</p>
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={() => router.replace('/web/sign-in')}>
          Go to sign in
        </button>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-brand">Pay &amp; Park</div>

      <div className="auth-header">
        <h1 className="text-heading">Forgot password</h1>
        <p className="text-small text-secondary">
          {sentTo === null
            ? 'Enter your email and we will send you a 6-digit code to reset your password.'
            : `Enter the 6-digit code sent to ${sentTo} and choose a new password.`}
        </p>
      </div>

      {sentTo === null ? (
        <>
          {emailError ? <Banner kind="danger">{emailError}</Banner> : null}

          <form className="stack" onSubmit={onRequestCode}>
            <Field label="Email" htmlFor="email" error={emailErrors.email}>
              <input
                id="email"
                type="email"
                className={`input${emailErrors.email ? ' has-error' : ''}`}
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <button type="submit" className="btn btn-primary btn-block" disabled={sendingCode}>
              {sendingCode ? 'Sending…' : 'Send code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <Banner kind="info">
            If an account exists for that address, the code is on its way. It expires in 10
            minutes. Check your spam folder if it does not arrive.
          </Banner>

          {resetError ? <Banner kind="danger">{resetError}</Banner> : null}

          <form className="stack" onSubmit={onReset}>
            <Field label="6-digit code" htmlFor="otp" error={resetErrors.otp}>
              <input
                id="otp"
                className={`input${resetErrors.otp ? ' has-error' : ''}`}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={resetValues.otp}
                onChange={(event) => setResetValues((current) => ({ ...current, otp: event.target.value }))}
              />
            </Field>

            <Field label="New password" htmlFor="newPassword" error={resetErrors.newPassword}>
              <input
                id="newPassword"
                type="password"
                className={`input${resetErrors.newPassword ? ' has-error' : ''}`}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={resetValues.newPassword}
                onChange={(event) =>
                  setResetValues((current) => ({ ...current, newPassword: event.target.value }))
                }
              />
            </Field>

            <Field
              label="Confirm new password"
              htmlFor="confirmNewPassword"
              error={resetErrors.confirmNewPassword}
            >
              <input
                id="confirmNewPassword"
                type="password"
                className={`input${resetErrors.confirmNewPassword ? ' has-error' : ''}`}
                autoComplete="new-password"
                value={resetValues.confirmNewPassword}
                onChange={(event) =>
                  setResetValues((current) => ({ ...current, confirmNewPassword: event.target.value }))
                }
              />
            </Field>

            <button type="submit" className="btn btn-primary btn-block" disabled={resetSubmitting}>
              {resetSubmitting ? 'Resetting…' : 'Reset password'}
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => void onResend()}
              disabled={cooldown > 0 || resending || resetSubmitting}
            >
              {resending ? 'Resending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>

            <button type="button" className="btn btn-ghost btn-block" onClick={startOver}>
              Use a different email
            </button>
          </form>
        </>
      )}

      <Banner kind="info">
        <strong>If you signed in with Google:</strong> your account has no password to reset.
        Password sign-in via this form only works for email/password accounts.
      </Banner>

      <Link href="/web/sign-in" className="text-small text-primary text-center">
        Back to sign in
      </Link>
    </main>
  );
}
