'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import {
  SHIFT_TYPE_LABELS,
  formatInr,
  formatPassDuration,
  type ParkingLocation,
  type PassBooking,
  type PassPlan,
  type ShiftType,
} from '@parking/shared';

import { apiRequest, errorMessage, WebApiError } from '../_lib/api';
import '../_lib/portal-theme.css';

const SHIFTS: ShiftType[] = ['DAY', 'NIGHT', 'BOTH'];

type Details = { name: string; phone: string; vehicleNumber: string; password: string };
const EMPTY_DETAILS: Details = { name: '', phone: '', vehicleNumber: '', password: '' };

type PayMethod = 'UPI' | 'CASH';

export default function PassApplyPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 1
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);

  // Step 2
  const [location, setLocation] = useState<ParkingLocation | null>(null);
  const [plans, setPlans] = useState<PassPlan[]>([]);
  const [shift, setShift] = useState<ShiftType>('DAY');
  const [planId, setPlanId] = useState<string | null>(null);

  // Step 3
  const [pass, setPass] = useState<PassBooking | null>(null);
  const [method, setMethod] = useState<PayMethod>('UPI');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [utr, setUtr] = useState('');
  const [doneMethod, setDoneMethod] = useState<PayMethod>('UPI');

  const shiftPlans = useMemo(() => plans.filter((p) => p.shiftType === shift), [plans, shift]);
  const availableShifts = useMemo(
    () => SHIFTS.filter((s) => plans.some((p) => p.shiftType === s)),
    [plans],
  );

  function setField(key: keyof Details, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  // ── Step 1: account + sign in ──────────────────────────────────────────
  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const errs: Record<string, string> = {};
    if (!details.name.trim()) errs.name = 'Enter your name';
    if (!details.phone.trim()) errs.phone = 'Enter your mobile number';
    if (!details.vehicleNumber.trim()) errs.vehicleNumber = 'Enter your vehicle number';
    if (details.password.length < 8) errs.password = 'Use at least 8 characters';
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    try {
      await apiRequest('/api/pass/account', {
        method: 'POST',
        body: { name: details.name, phone: details.phone, password: details.password },
      });

      const result = await signIn('credentials', {
        email: details.phone,
        password: details.password,
        redirect: false,
      });
      if (!result || result.error) {
        setFormError(
          'We could not sign you in. If you already have an account with this number, check your password.',
        );
        return;
      }

      const locations = await apiRequest<ParkingLocation[]>('/api/locations');
      const active = locations[0];
      if (!active) {
        setFormError('No parking location is available right now.');
        return;
      }
      setLocation(active);
      const list = await apiRequest<PassPlan[]>(
        `/api/locations/${active.id}/pass-plans?vehicleType=BIKE`,
      );
      setPlans(list);
      const firstShift = SHIFTS.find((s) => list.some((p) => p.shiftType === s)) ?? 'DAY';
      setShift(firstShift);
      setPlanId(list.find((p) => p.shiftType === firstShift)?.id ?? null);
      setStep(2);
    } catch (error) {
      if (error instanceof WebApiError && error.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(error.fields)) mapped[k] = v[0] ?? '';
        setFieldErrors(mapped);
      }
      setFormError(errorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2: create the pass ────────────────────────────────────────────
  async function submitPlan(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!location || !planId) {
      setFormError('Please choose a plan.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiRequest<PassBooking>('/api/passes', {
        method: 'POST',
        body: {
          locationId: location.id,
          passPlanId: planId,
          vehicleNumber: details.vehicleNumber,
          vehicleType: 'BIKE',
          vehicleCategory: 'OTHER',
          mobileNumber: details.phone,
          address: '—',
        },
      });
      setPass(created);
      setStep(3);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create the pass. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function onPickFile(file: File | null) {
    setScreenshot(file);
    setPreview((cur) => {
      if (cur) URL.revokeObjectURL(cur);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  // ── Step 3: payment ────────────────────────────────────────────────────
  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!pass) return;
    setFormError(null);
    setFieldErrors({});

    if (method === 'CASH') {
      setBusy(true);
      try {
        await apiRequest(`/api/passes/${pass.id}/payment-method`, {
          method: 'POST',
          body: { method: 'CASH' },
        });
        setDoneMethod('CASH');
        setStep(4);
      } catch (error) {
        setFormError(errorMessage(error, 'Could not submit. Please try again.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!screenshot) {
      setFieldErrors({ screenshot: 'Attach a screenshot of your payment.' });
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/passes/${pass.id}/payment-method`, {
        method: 'POST',
        body: { method: 'UPI' },
      });
      const form = new FormData();
      form.append('screenshot', screenshot);
      if (utr.trim()) form.append('utr', utr.trim());
      await apiRequest(`/api/passes/${pass.id}/utr`, { method: 'POST', body: form });
      setDoneMethod('UPI');
      setStep(4);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not submit your payment. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const stepLabel =
    step === 1
      ? 'Step 1 of 3 — your details'
      : step === 2
        ? 'Step 2 of 3 — choose your pass'
        : step === 3
          ? 'Step 3 of 3 — payment'
          : 'All done';

  return (
    <div className="portal">
      <header className="pp-header">
        <span className="pp-mark">P</span>
        <div>
          <div className="pp-title">Kumar Enterprises — Parking</div>
          <div className="pp-sub">Kalyan · Two-Wheeler Pass</div>
        </div>
      </header>

      <main className="pp-container">
        <h1 className="pp-h1">Apply for a parking pass</h1>
        <p className="pp-lead">{stepLabel}</p>

        {formError ? <div className="pp-alert pp-alert-bad">{formError}</div> : null}

        {/* ── Step 1 ── */}
        {step === 1 && (
          <form onSubmit={submitDetails} noValidate>
            <div className="pp-card">
              <div className="pp-field">
                <label className="pp-label" htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="pp-input"
                  autoComplete="name"
                  value={details.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
                {fieldErrors.name && <p className="pp-error">{fieldErrors.name}</p>}
              </div>
              <div className="pp-field">
                <label className="pp-label" htmlFor="phone">Contact number</label>
                <input
                  id="phone"
                  className="pp-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={details.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
                {fieldErrors.phone && <p className="pp-error">{fieldErrors.phone}</p>}
              </div>
              <div className="pp-field">
                <label className="pp-label" htmlFor="vehicleNumber">Vehicle number</label>
                <input
                  id="vehicleNumber"
                  className="pp-input"
                  autoCapitalize="characters"
                  placeholder="e.g. MH04AB1234"
                  value={details.vehicleNumber}
                  onChange={(e) => setField('vehicleNumber', e.target.value)}
                />
                {fieldErrors.vehicleNumber && <p className="pp-error">{fieldErrors.vehicleNumber}</p>}
              </div>
              <div className="pp-field" style={{ marginBottom: 0 }}>
                <label className="pp-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="pp-input"
                  type="password"
                  autoComplete="current-password"
                  value={details.password}
                  onChange={(e) => setField('password', e.target.value)}
                />
                {fieldErrors.password ? (
                  <p className="pp-error">{fieldErrors.password}</p>
                ) : (
                  <p className="pp-small pp-muted" style={{ marginTop: 6 }}>
                    New here? We&apos;ll create your account. Returning? Use your existing password.
                  </p>
                )}
              </div>
            </div>
            <div className="pp-mt">
              <button className="pp-btn pp-btn-primary pp-btn-block" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : 'Continue'}
              </button>
            </div>
            <p className="pp-small pp-muted pp-center pp-mt">
              Already registered? <Link href="/web/sign-in" className="pp-link">Log in</Link>
            </p>
          </form>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <form onSubmit={submitPlan}>
            <div className="pp-card">
              <h2 className="pp-h2">Pass type</h2>
              <div className="pp-segmented" role="group" aria-label="Pass type">
                {availableShifts.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="pp-seg"
                    aria-pressed={shift === s}
                    onClick={() => {
                      setShift(s);
                      setPlanId(plans.find((p) => p.shiftType === s)?.id ?? null);
                    }}
                  >
                    {SHIFT_TYPE_LABELS[s]}
                  </button>
                ))}
              </div>

              <h2 className="pp-h2" style={{ marginTop: 18 }}>Duration</h2>
              {shiftPlans.length === 0 ? (
                <p className="pp-small pp-muted">No plans available for this type right now.</p>
              ) : (
                <div className="pp-options" role="radiogroup" aria-label="Duration">
                  {shiftPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="pp-option"
                      role="radio"
                      tabIndex={0}
                      aria-checked={planId === plan.id}
                      data-selected={planId === plan.id}
                      onClick={() => setPlanId(plan.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setPlanId(plan.id);
                        }
                      }}
                    >
                      <div>
                        <div className="pp-opt-label">{plan.label}</div>
                        <div className="pp-opt-sub">
                          {formatPassDuration(plan.durationUnit, plan.durationValue)}
                        </div>
                      </div>
                      <div className="pp-opt-price">{formatInr(plan.priceInPaise)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pp-mt">
              <button className="pp-btn pp-btn-primary pp-btn-block" type="submit" disabled={busy || !planId}>
                {busy ? 'Please wait…' : 'Continue to payment'}
              </button>
            </div>
          </form>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && pass && (
          <form onSubmit={submitPayment}>
            <div className="pp-card">
              <div className="pp-center">
                <div className="pp-small pp-muted">Amount to pay</div>
                <div className="pp-h1" style={{ margin: '2px 0 0' }}>{formatInr(pass.amountInPaise)}</div>
              </div>
            </div>

            <div className="pp-card">
              <h2 className="pp-h2">How would you like to pay?</h2>
              <div className="pp-segmented" role="group" aria-label="Payment method" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <button type="button" className="pp-seg" aria-pressed={method === 'UPI'} onClick={() => setMethod('UPI')}>
                  UPI (online)
                </button>
                <button type="button" className="pp-seg" aria-pressed={method === 'CASH'} onClick={() => setMethod('CASH')}>
                  Cash at parking
                </button>
              </div>

              {method === 'UPI' ? (
                <div style={{ marginTop: 16 }}>
                  {pass.location.upiQrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pp-qr" src={pass.location.upiQrImageUrl} alt="UPI QR code" />
                  ) : null}
                  <p className="pp-small pp-muted pp-center">
                    Scan and pay {formatInr(pass.amountInPaise)}, then upload your payment screenshot.
                  </p>
                  <div className="pp-field" style={{ marginTop: 14 }}>
                    <label className="pp-label" htmlFor="screenshot">Payment screenshot</label>
                    <label className="pp-file" data-has={screenshot ? 'true' : 'false'}>
                      <input
                        id="screenshot"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                      />
                      {screenshot ? `Selected: ${screenshot.name}` : 'Tap to attach your payment screenshot'}
                    </label>
                    {fieldErrors.screenshot && <p className="pp-error">{fieldErrors.screenshot}</p>}
                    {preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="pp-thumb" src={preview} alt="Screenshot preview" />
                    )}
                  </div>
                  <div className="pp-field" style={{ marginBottom: 0 }}>
                    <label className="pp-label" htmlFor="utr">UPI reference / UTR <span className="pp-muted">(optional)</span></label>
                    <input
                      id="utr"
                      className="pp-input"
                      value={utr}
                      onChange={(e) => setUtr(e.target.value)}
                      placeholder="e.g. 4312 7788 9901"
                    />
                  </div>
                </div>
              ) : (
                <p className="pp-small pp-muted" style={{ marginTop: 14 }}>
                  Pay <strong>{formatInr(pass.amountInPaise)}</strong> in cash at the parking counter.
                  Submit now and your pass will be activated once an admin confirms the payment.
                </p>
              )}
            </div>

            <div className="pp-mt">
              <button className="pp-btn pp-btn-primary pp-btn-block" type="submit" disabled={busy}>
                {busy
                  ? 'Submitting…'
                  : method === 'UPI'
                    ? 'Submit payment for verification'
                    : 'Submit (pay cash at parking)'}
              </button>
            </div>
          </form>
        )}

        {/* ── Step 4: done ── */}
        {step === 4 && pass && (
          <div>
            <div className="pp-center" style={{ padding: '8px 0 14px' }}>
              <span className="pp-badge pp-badge-ok" style={{ marginBottom: 12 }}>
                <span className="pp-dot" /> Submitted
              </span>
              <h2 className="pp-h2" style={{ marginBottom: 6 }}>You&apos;re all set</h2>
              <p className="pp-lead" style={{ marginBottom: 0 }}>
                {doneMethod === 'UPI'
                  ? 'Your payment is submitted and your pass is pending verification.'
                  : 'Please pay cash at the parking counter — your pass will be activated after approval.'}
              </p>
            </div>
            <div className="pp-card">
              <div style={{ fontWeight: 700 }}>{pass.passNumber}</div>
              <p className="pp-small pp-muted" style={{ margin: '4px 0 0' }}>
                {SHIFT_TYPE_LABELS[pass.shiftType]} · {pass.planLabel} · {formatInr(pass.amountInPaise)}
              </p>
            </div>
            <div className="pp-actions pp-mt">
              <button className="pp-btn pp-btn-primary pp-btn-block" onClick={() => router.push('/web/customer/passes')}>
                View my passes
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
