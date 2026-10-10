'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  COMPLAINT_STATUS_LABELS,
  type AdminComplaint,
  type ComplaintStatus,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { ComplaintDetail } from '../../../_components/ComplaintDetail';
import { Field } from '../../../_components/Field';
import { apiRequest, errorMessage } from '../../../_lib/api';
import { applyApiError, type FieldErrors } from '../../../_lib/validation';

/** Mirrors `COMPLAINT_TRANSITIONS` in the API (`lib/complaints.ts`). */
const NEXT_STATUSES: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

export default function AdminComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [complaint, setComplaint] = useState<AdminComplaint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setComplaint(await apiRequest<AdminComplaint>(`/api/admin/complaints/${id}`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this complaint.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!status) {
      setFieldErrors({ status: 'Choose a status' });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const updated = await apiRequest<AdminComplaint>(`/api/admin/complaints/${id}`, {
        method: 'PATCH',
        body: { status, resolutionNote: note },
      });
      setComplaint(updated);
      setStatus('');
      setNote('');
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSaving(false);
    }
  };

  const options = complaint ? NEXT_STATUSES[complaint.status] : [];

  return (
    <div className="stack-loose">
      <Link href="/web/admin/complaints" className="text-small">
        ← All complaints
      </Link>
      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
      {!complaint && !loadError ? <div className="loading-center">Loading…</div> : null}

      {complaint ? (
        <>
          <div className="card">
            <p className="text-small-bold">{complaint.user.name ?? '(no name on file)'}</p>
            <p className="text-small text-secondary">
              {complaint.user.email}
              {complaint.user.phone ? ` · ${complaint.user.phone}` : ''}
            </p>
          </div>

          <ComplaintDetail complaint={complaint} />

          {options.length > 0 ? (
            <form className="card stack" onSubmit={onSubmit}>
              <p className="text-small-bold">Update status</p>
              {formError ? <Banner kind="danger">{formError}</Banner> : null}

              <div className="field">
                <div className="chip-row">
                  {options.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip${status === value ? ' selected' : ''}`}
                      onClick={() => setStatus(value)}
                    >
                      {COMPLAINT_STATUS_LABELS[value]}
                    </button>
                  ))}
                </div>
                {fieldErrors.status ? <span className="field-error">{fieldErrors.status}</span> : null}
              </div>

              <Field
                label="Note to the user"
                htmlFor="note"
                error={fieldErrors.resolutionNote}
                hint="Required when resolving or rejecting."
              >
                <textarea
                  id="note"
                  className={`textarea${fieldErrors.resolutionNote ? ' has-error' : ''}`}
                  rows={4}
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>

              <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
