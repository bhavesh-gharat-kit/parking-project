'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  AdminPassEditRequestSchema,
  PASS_DURATION_UNITS,
  PASS_DURATION_UNIT_LABELS,
  PASS_ENTRY_SIDES,
  PASS_ENTRY_SIDE_LABELS,
  PASS_HOLIDAY_OFF_DAYS,
  PASS_HOLIDAY_OFF_DAY_LABELS,
  PASS_OCCUPATION_CATEGORIES,
  PASS_OCCUPATION_CATEGORY_LABELS,
  PASS_SPECIFICATIONS,
  PASS_SPECIFICATION_LABELS,
  PASS_VEHICLE_CATEGORIES,
  PASS_VEHICLE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstDateTime,
  formatPassDuration,
  istParts,
  paiseToRupees,
  rupeesToPaise,
  type AdminPass,
  type AdminPassStatusEvent,
  type PassBookingStatus,
  type PassEntrySide,
  type PassHolidayOffDay,
  type PassOccupationCategory,
  type PassSpecification,
  type PassVehicleCategory,
  type ShiftType,
  type VehicleType,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Field } from '../../../_components/Field';
import { PassStatusPill } from '../../../_components/Pill';
import { apiRequest, errorMessage } from '../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../_lib/validation';

type Row = { label: string; value: string };

function isActionable(status: PassBookingStatus): boolean {
  return status === 'PAYMENT_VERIFICATION' || status === 'PENDING_APPROVAL';
}

/** `2026-10-01T00:00:00.000+05:30` serialised as UTC → `2026-10-01`, the IST
 *  calendar day a `<input type="date">` needs — slicing the ISO string
 *  itself would read the UTC date and be off by one near midnight IST. */
function toDateInputValue(iso: string): string {
  const { year, month, day } = istParts(iso);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const FIELD_LABELS: Record<string, string> = {
  vehicleNumber: 'Vehicle number',
  vehicleType: 'Vehicle type',
  vehicleCategory: 'Vehicle category',
  mobileNumber: 'Mobile number',
  address: 'Address',
  occupationCategory: 'Occupation',
  occupationOther: 'Occupation (other)',
  holidayOffDay: 'Weekly off day',
  holidayOffDayOther: 'Weekly off day (other)',
  helmet: 'Helmet',
  locker: 'Locker',
  airCheck: 'Air check',
  rickshawParking: 'Rickshaw parking',
  renewalReference: 'Renewal reference',
  expectedParkingDays: 'Expected parking days',
  entryTime: 'Usual arrival time',
  exitTime: 'Usual leaving time',
  specification: 'Specification',
  entrySide: 'Entry side',
  planLabel: 'Plan label',
  shiftType: 'Shift',
  durationUnit: 'Duration unit',
  durationValue: 'Duration',
  amountInPaise: 'Amount',
  startDate: 'Valid from',
  endDate: 'Valid until',
};

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function formatDiffValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'amountInPaise' && typeof value === 'number') return formatInr(value);
  if (isIsoDateTime(value)) return formatIstDate(value);
  return String(value);
}

function EventTimeline({ events }: { events: AdminPassStatusEvent[] }) {
  return (
    <div className="stack">
      {events.map((event) => (
        <div className="card" key={event.id}>
          <div className="card-header-row">
            <p className="text-small-bold">
              {event.toStatus
                ? event.fromStatus
                  ? `${event.fromStatus} → ${event.toStatus}`
                  : `Created — ${event.toStatus}`
                : 'Field edit'}
            </p>
            <p className="text-small text-secondary">{formatIstDateTime(event.createdAt)}</p>
          </div>
          <p className="text-small text-secondary">
            {event.actor ? (event.actor.name ?? event.actor.email) : 'System'}
            {event.actorRole ? ` · ${event.actorRole}` : ''}
          </p>
          {event.note ? <p className="text-small">{event.note}</p> : null}
          {event.changedFields ? (
            <div className="stack" style={{ marginTop: 4 }}>
              {Object.entries(event.changedFields).map(([field, diff]) => (
                <p className="text-small text-secondary" key={field}>
                  <strong>{FIELD_LABELS[field] ?? field}:</strong> {formatDiffValue(field, diff.from)} →{' '}
                  {formatDiffValue(field, diff.to)}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function AdminPassDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [passBooking, setPassBooking] = useState<AdminPass | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [approveMode, setApproveMode] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [approveSpecification, setApproveSpecification] = useState<PassSpecification | null>(null);
  const [approveEntrySide, setApproveEntrySide] = useState<PassEntrySide | null>(null);

  const [rejectMode, setRejectMode] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const [viewerOpen, setViewerOpen] = useState(false);

  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [editFieldErrors, setEditFieldErrors] = useState<FieldErrors>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetEditValues = useCallback((row: AdminPass) => {
    setEditValues({
      vehicleNumber: row.vehicleNumber,
      vehicleType: row.vehicleType,
      vehicleCategory: row.vehicleCategory,
      mobileNumber: row.mobileNumber,
      address: row.address,
      occupationCategory: row.occupationCategory,
      occupationOther: row.occupationOther ?? '',
      holidayOffDay: row.holidayOffDay,
      holidayOffDayOther: row.holidayOffDayOther ?? '',
      helmet: row.helmet,
      locker: row.locker,
      airCheck: row.airCheck,
      rickshawParking: row.rickshawParking,
      renewalReference: row.renewalReference ?? '',
      expectedParkingDays: row.expectedParkingDays === null ? '' : String(row.expectedParkingDays),
      entryTime: row.entryTime ?? '',
      exitTime: row.exitTime ?? '',
      specification: row.specification,
      entrySide: row.entrySide,
      planLabel: row.planLabel,
      shiftType: row.shiftType,
      durationUnit: row.durationUnit,
      durationValue: String(row.durationValue),
      amountInRupees: String(paiseToRupees(row.amountInPaise)),
      startDate: toDateInputValue(row.startDate),
      endDate: toDateInputValue(row.endDate),
      note: '',
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const row = await apiRequest<AdminPass>(`/api/admin/passes/${id}`);
      setPassBooking(row);
      resetEditValues(row);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this pass application.'));
    }
  }, [id, resetEditValues]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  const approve = async () => {
    const prompt =
      passBooking?.paymentMethod === 'UPI'
        ? 'Confirm you have checked the UTR against the bank statement, then approve.'
        : 'Confirm the cash has been received, then approve.';
    if (!confirm(prompt)) return;

    setApproving(true);
    try {
      const updated = await apiRequest<AdminPass>(`/api/admin/passes/${id}/approve`, {
        method: 'POST',
        body: {
          note: approveNote.trim() || undefined,
          specification: approveSpecification ?? undefined,
          entrySide: approveEntrySide ?? undefined,
        },
      });
      setPassBooking(updated);
      resetEditValues(updated);
      setApproveMode(false);
      setApproveNote('');
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
      void load();
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!reviewNote.trim()) return;
    setRejecting(true);
    try {
      const updated = await apiRequest<AdminPass>(`/api/admin/passes/${id}/reject`, {
        method: 'POST',
        body: { reviewNote: reviewNote.trim() },
      });
      setPassBooking(updated);
      resetEditValues(updated);
      setRejectMode(false);
      setReviewNote('');
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
      void load();
    } finally {
      setRejecting(false);
    }
  };

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    setEditError(null);

    const { amountInRupees, ...rest } = editValues;
    const candidate = {
      ...rest,
      amountInPaise: rupeesToPaise(Number(amountInRupees)),
    };

    const parsed = safeParseForm(AdminPassEditRequestSchema, candidate);
    if (!parsed.ok) {
      setEditFieldErrors(parsed.errors);
      return;
    }
    setEditFieldErrors({});
    setSaving(true);

    try {
      const updated = await apiRequest<AdminPass>(`/api/admin/passes/${id}`, {
        method: 'PATCH',
        body: parsed.data,
      });
      setPassBooking(updated);
      resetEditValues(updated);
    } catch (error) {
      setEditError(applyApiError(error, setEditFieldErrors));
    } finally {
      setSaving(false);
    }
  };

  if (passBooking === null) {
    return (
      <div className="stack-loose">
        {loadError ? (
          <>
            <Banner kind="danger">{loadError}</Banner>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <div className="loading-center">Loading…</div>
        )}
      </div>
    );
  }

  const rows: Row[] = [
    { label: 'Customer', value: passBooking.customer.name ?? '(no name on file)' },
    { label: 'Email', value: passBooking.customer.email },
    ...(passBooking.customer.phone ? [{ label: 'Phone', value: passBooking.customer.phone }] : []),
    { label: 'Location', value: passBooking.location.name },
    { label: 'Vehicle', value: `${passBooking.vehicleNumber} (${PASS_VEHICLE_CATEGORY_LABELS[passBooking.vehicleCategory]})` },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[passBooking.vehicleType] },
    { label: 'Shift', value: SHIFT_TYPE_LABELS[passBooking.shiftType] },
    { label: 'Plan', value: `${passBooking.planLabel} (${formatPassDuration(passBooking.durationUnit, passBooking.durationValue)})` },
    { label: 'Mobile', value: passBooking.mobileNumber },
    { label: 'Address', value: passBooking.address },
    { label: 'Valid from', value: formatIstDate(passBooking.startDate) },
    { label: 'Valid until', value: formatIstDate(passBooking.endDate) },
    { label: 'Amount', value: formatInr(passBooking.amountInPaise) },
    {
      label: 'Payment method',
      value: passBooking.paymentMethod ? PAYMENT_METHOD_LABELS[passBooking.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      value: passBooking.payment ? PAYMENT_STATUS_LABELS[passBooking.payment.status] : 'Not started',
    },
    {
      label: 'Specification',
      value: passBooking.specification ? PASS_SPECIFICATION_LABELS[passBooking.specification] : 'Not set',
    },
    { label: 'Entry side', value: passBooking.entrySide ? PASS_ENTRY_SIDE_LABELS[passBooking.entrySide] : 'Not set' },
    ...(passBooking.occupationCategory
      ? [
          {
            label: 'Occupation',
            value:
              passBooking.occupationCategory === 'OTHER' && passBooking.occupationOther
                ? passBooking.occupationOther
                : PASS_OCCUPATION_CATEGORY_LABELS[passBooking.occupationCategory],
          },
        ]
      : []),
    ...(passBooking.holidayOffDay
      ? [
          {
            label: 'Weekly off day',
            value:
              passBooking.holidayOffDay === 'OTHER' && passBooking.holidayOffDayOther
                ? passBooking.holidayOffDayOther
                : PASS_HOLIDAY_OFF_DAY_LABELS[passBooking.holidayOffDay],
          },
        ]
      : []),
    ...(passBooking.expectedParkingDays !== null
      ? [{ label: 'Expected parking days', value: String(passBooking.expectedParkingDays) }]
      : []),
    ...(passBooking.entryTime ? [{ label: 'Usual arrival time', value: passBooking.entryTime }] : []),
    ...(passBooking.exitTime ? [{ label: 'Usual leaving time', value: passBooking.exitTime }] : []),
    ...(passBooking.renewalReference ? [{ label: 'Renewal reference', value: passBooking.renewalReference }] : []),
    { label: 'Facilities', value: (['helmet', 'locker', 'airCheck', 'rickshawParking'] as const)
        .filter((key) => passBooking[key])
        .map((key) => FIELD_LABELS[key])
        .join(', ') || 'None' },
    ...(passBooking.reviewNote ? [{ label: 'Review note', value: passBooking.reviewNote }] : []),
  ];

  return (
    <div className="stack-loose">
      <div className="card">
        <p className="text-small text-secondary">Pass number</p>
        <p className="text-subtitle">{passBooking.passNumber}</p>
        <PassStatusPill status={passBooking.status} large />
        {passBooking.status === 'CONFIRMED' ? (
          <Link href={`/web/customer/passes/${id}/pass`} className="btn btn-secondary">
            View / print pass document
          </Link>
        ) : null}
      </div>

      {passBooking.payment?.upiUtr || passBooking.payment?.utrScreenshotUrl ? (
        <div className="card" style={{ borderWidth: 2, borderColor: 'var(--color-primary)', borderStyle: 'solid' }}>
          <p className="text-small text-secondary">Payment evidence — check this against the bank statement</p>
          {passBooking.payment.upiUtr ? <p className="text-heading">{passBooking.payment.upiUtr}</p> : null}
          {passBooking.payment.utrScreenshotUrl ? (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <Image
                src={passBooking.payment.utrScreenshotUrl}
                alt="Payment screenshot"
                width={120}
                height={120}
                className="screenshot-preview"
                unoptimized
              />
              <p className="text-small text-secondary">Tap to view full size</p>
            </button>
          ) : null}
        </div>
      ) : null}

      {viewerOpen && passBooking.payment?.utrScreenshotUrl ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setViewerOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size modal view of an arbitrary uploaded image */}
          <img
            src={passBooking.payment.utrScreenshotUrl}
            alt="Payment screenshot full size"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        </div>
      ) : null}

      <div className="card card-flush">
        {rows.map((row, index) => (
          <div className="card-row" key={row.label} style={index === 0 ? { borderTop: 'none' } : undefined}>
            <span className="card-row-label">{row.label}</span>
            <span className="card-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {isActionable(passBooking.status) && !rejectMode && !approveMode ? (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => setApproveMode(true)}>
            Approve
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setRejectMode(true)}>
            Reject
          </button>
        </div>
      ) : null}

      {approveMode ? (
        <div className="card">
          <p className="text-small-bold">Approve this pass?</p>
          <p className="text-small text-secondary">
            Optionally set the classification and entry side now, or leave either for later.
          </p>

          <div className="field">
            <span className="field-label">Specification (optional)</span>
            <div className="chip-row">
              {PASS_SPECIFICATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${approveSpecification === value ? ' selected' : ''}`}
                  onClick={() => setApproveSpecification((current) => (current === value ? null : value))}
                >
                  {PASS_SPECIFICATION_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Entry side (optional)</span>
            <div className="chip-row">
              {PASS_ENTRY_SIDES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${approveEntrySide === value ? ' selected' : ''}`}
                  onClick={() => setApproveEntrySide((current) => (current === value ? null : value))}
                >
                  {PASS_ENTRY_SIDE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="textarea"
            placeholder="Note (optional)"
            value={approveNote}
            onChange={(event) => setApproveNote(event.target.value)}
          />

          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={approving} onClick={() => void approve()}>
              {approving ? 'Approving…' : 'Confirm approval'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={approving}
              onClick={() => setApproveMode(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {rejectMode ? (
        <div className="card">
          <p className="text-small-bold">Reject this pass application?</p>
          <p className="text-small text-secondary">This reason is shown to the customer.</p>
          <textarea
            className="textarea"
            placeholder="e.g. UTR does not match any received payment"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={rejecting || !reviewNote.trim()}
              onClick={() => void reject()}
            >
              {rejecting ? 'Rejecting…' : 'Confirm rejection'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={rejecting}
              onClick={() => {
                setRejectMode(false);
                setReviewNote('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <h2 className="text-subtitle">Edit pass details</h2>
      <p className="text-small text-secondary">
        Every field here — including the ones the customer typed — is edited through this one form. A short note
        is required so the history below stays readable.
      </p>

      {editError ? <Banner kind="danger">{editError}</Banner> : null}

      <form className="stack" onSubmit={onSaveEdit}>
        <Field label="Vehicle number" htmlFor="vehicleNumber" error={editFieldErrors.vehicleNumber}>
          <input
            id="vehicleNumber"
            className={`input${editFieldErrors.vehicleNumber ? ' has-error' : ''}`}
            value={editValues.vehicleNumber as string}
            onChange={(event) => setEditValues((c) => ({ ...c, vehicleNumber: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Vehicle type</span>
          <div className="chip-row">
            {VEHICLE_TYPES.map((type: VehicleType) => (
              <button
                key={type}
                type="button"
                className={`chip${editValues.vehicleType === type ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, vehicleType: type }))}
              >
                {VEHICLE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Vehicle category</span>
          <div className="chip-row">
            {PASS_VEHICLE_CATEGORIES.map((category: PassVehicleCategory) => (
              <button
                key={category}
                type="button"
                className={`chip${editValues.vehicleCategory === category ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, vehicleCategory: category }))}
              >
                {PASS_VEHICLE_CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Mobile number" htmlFor="mobileNumber" error={editFieldErrors.mobileNumber}>
          <input
            id="mobileNumber"
            className={`input${editFieldErrors.mobileNumber ? ' has-error' : ''}`}
            value={editValues.mobileNumber as string}
            onChange={(event) => setEditValues((c) => ({ ...c, mobileNumber: event.target.value }))}
          />
        </Field>

        <Field label="Address" htmlFor="address" error={editFieldErrors.address}>
          <textarea
            id="address"
            className={`textarea${editFieldErrors.address ? ' has-error' : ''}`}
            value={editValues.address as string}
            onChange={(event) => setEditValues((c) => ({ ...c, address: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Occupation</span>
          <div className="chip-row">
            {PASS_OCCUPATION_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`chip${editValues.occupationCategory === category ? ' selected' : ''}`}
                onClick={() =>
                  setEditValues((c) => ({
                    ...c,
                    occupationCategory: c.occupationCategory === category ? null : category,
                  }))
                }
              >
                {PASS_OCCUPATION_CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
          {editValues.occupationCategory === 'OTHER' ? (
            <Field label="Specify occupation" htmlFor="occupationOther" error={editFieldErrors.occupationOther}>
              <input
                id="occupationOther"
                className="input"
                value={editValues.occupationOther as string}
                onChange={(event) => setEditValues((c) => ({ ...c, occupationOther: event.target.value }))}
              />
            </Field>
          ) : null}
        </div>

        <div className="field">
          <span className="field-label">Weekly off day</span>
          <div className="chip-row">
            {PASS_HOLIDAY_OFF_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={`chip${editValues.holidayOffDay === day ? ' selected' : ''}`}
                onClick={() =>
                  setEditValues((c) => ({ ...c, holidayOffDay: c.holidayOffDay === day ? null : day }))
                }
              >
                {PASS_HOLIDAY_OFF_DAY_LABELS[day]}
              </button>
            ))}
          </div>
          {editValues.holidayOffDay === 'OTHER' ? (
            <Field label="Specify day" htmlFor="holidayOffDayOther" error={editFieldErrors.holidayOffDayOther}>
              <input
                id="holidayOffDayOther"
                className="input"
                value={editValues.holidayOffDayOther as string}
                onChange={(event) => setEditValues((c) => ({ ...c, holidayOffDayOther: event.target.value }))}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Expected parking days" htmlFor="expectedParkingDays" error={editFieldErrors.expectedParkingDays}>
          <input
            id="expectedParkingDays"
            type="number"
            min={1}
            max={31}
            className="input"
            value={editValues.expectedParkingDays as string}
            onChange={(event) => setEditValues((c) => ({ ...c, expectedParkingDays: event.target.value }))}
          />
        </Field>

        <Field label="Usual arrival time" htmlFor="entryTime" error={editFieldErrors.entryTime}>
          <input
            id="entryTime"
            type="time"
            className="input"
            value={editValues.entryTime as string}
            onChange={(event) => setEditValues((c) => ({ ...c, entryTime: event.target.value }))}
          />
        </Field>

        <Field label="Usual leaving time" htmlFor="exitTime" error={editFieldErrors.exitTime}>
          <input
            id="exitTime"
            type="time"
            className="input"
            value={editValues.exitTime as string}
            onChange={(event) => setEditValues((c) => ({ ...c, exitTime: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Facilities</span>
          <div className="chip-row">
            {(
              [
                ['helmet', 'Helmet'],
                ['locker', 'Locker'],
                ['airCheck', 'Air Check'],
                ['rickshawParking', 'Rickshaw Parking'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip${editValues[key] ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, [key]: !c[key] }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Renewal reference" htmlFor="renewalReference" error={editFieldErrors.renewalReference}>
          <input
            id="renewalReference"
            className="input"
            value={editValues.renewalReference as string}
            onChange={(event) => setEditValues((c) => ({ ...c, renewalReference: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Specification (admin-only)</span>
          <div className="chip-row">
            {PASS_SPECIFICATIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${editValues.specification === value ? ' selected' : ''}`}
                onClick={() =>
                  setEditValues((c) => ({ ...c, specification: c.specification === value ? null : value }))
                }
              >
                {PASS_SPECIFICATION_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Entry side (admin-only)</span>
          <div className="chip-row">
            {PASS_ENTRY_SIDES.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${editValues.entrySide === value ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, entrySide: c.entrySide === value ? null : value }))}
              >
                {PASS_ENTRY_SIDE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Plan label" htmlFor="planLabel" error={editFieldErrors.planLabel}>
          <input
            id="planLabel"
            className="input"
            value={editValues.planLabel as string}
            onChange={(event) => setEditValues((c) => ({ ...c, planLabel: event.target.value }))}
          />
        </Field>

        <div className="field">
          <span className="field-label">Shift</span>
          <div className="chip-row">
            {SHIFT_TYPES.map((shift: ShiftType) => (
              <button
                key={shift}
                type="button"
                className={`chip${editValues.shiftType === shift ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, shiftType: shift }))}
              >
                {SHIFT_TYPE_LABELS[shift]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Duration unit</span>
          <div className="chip-row">
            {PASS_DURATION_UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                className={`chip${editValues.durationUnit === unit ? ' selected' : ''}`}
                onClick={() => setEditValues((c) => ({ ...c, durationUnit: unit }))}
              >
                {PASS_DURATION_UNIT_LABELS[unit]}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={editValues.durationUnit === 'DAYS' ? 'Duration (days)' : 'Duration (months)'}
          htmlFor="durationValue"
          error={editFieldErrors.durationValue}
          hint="A snapshot of the plan at the time this pass was bought — editing it does not recompute Valid from/until below."
        >
          <input
            id="durationValue"
            type="number"
            className="input"
            value={editValues.durationValue as string}
            onChange={(event) => setEditValues((c) => ({ ...c, durationValue: event.target.value }))}
          />
        </Field>

        <Field label="Amount (₹)" htmlFor="amountInRupees" error={editFieldErrors.amountInPaise}>
          <input
            id="amountInRupees"
            type="number"
            step="0.01"
            className="input"
            value={editValues.amountInRupees as string}
            onChange={(event) => setEditValues((c) => ({ ...c, amountInRupees: event.target.value }))}
          />
        </Field>

        <Field
          label="Valid from"
          htmlFor="startDate"
          error={editFieldErrors.startDate}
          hint="A manual override — nothing else recomputes when this changes."
        >
          <input
            id="startDate"
            type="date"
            className="input"
            value={editValues.startDate as string}
            onChange={(event) => setEditValues((c) => ({ ...c, startDate: event.target.value }))}
          />
        </Field>

        <Field label="Valid until" htmlFor="endDate" error={editFieldErrors.endDate}>
          <input
            id="endDate"
            type="date"
            className="input"
            value={editValues.endDate as string}
            onChange={(event) => setEditValues((c) => ({ ...c, endDate: event.target.value }))}
          />
        </Field>

        <Field
          label="Note (required)"
          htmlFor="note"
          error={editFieldErrors.note}
          hint="Why this edit was made — shown on the history below."
        >
          <textarea
            id="note"
            className={`textarea${editFieldErrors.note ? ' has-error' : ''}`}
            value={editValues.note as string}
            onChange={(event) => setEditValues((c) => ({ ...c, note: event.target.value }))}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <h2 className="text-subtitle">History</h2>
      <EventTimeline events={passBooking.statusEvents} />
    </div>
  );
}
