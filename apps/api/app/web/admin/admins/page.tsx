'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  formatIstDateTime,
  type AdminAccount,
  type AdminAuditEvent,
  type Paginated,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { Field } from '../../_components/Field';
import { Pill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

type ListResponse = Paginated<AdminAccount> & { auditEvents: AdminAuditEvent[] };

const EMPTY_FORM = { name: '', email: '', phone: '', password: '', role: 'ADMIN' };

export default function AdminAccountsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await apiRequest<ListResponse>('/api/admin/admins?pageSize=100'));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load admins.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; reloads call the same stable callback outside an effect
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, id: string, done: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      await load();
    } catch (error) {
      alert(errorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleBlock = (admin: AdminAccount) => {
    const blocking = admin.isActive;
    const text = blocking
      ? `Block ${admin.email}? They are signed out immediately and cannot sign in until unblocked.`
      : `Unblock ${admin.email}?`;
    if (!confirm(text)) return;
    void act(
      () => apiRequest(`/api/admin/admins/${admin.id}`, { method: 'PATCH', body: { isActive: !blocking } }),
      admin.id,
      blocking ? 'Admin blocked.' : 'Admin unblocked.',
    );
  };

  const resetPassword = (admin: AdminAccount) => {
    const password = prompt(`New password for ${admin.email} (min 8 characters):`);
    if (!password) return;
    void act(
      () => apiRequest(`/api/admin/admins/${admin.id}`, { method: 'PATCH', body: { password } }),
      admin.id,
      'Password updated.',
    );
  };

  const remove = (admin: AdminAccount) => {
    if (!confirm(`Permanently delete ${admin.email}? This cannot be undone.`)) return;
    void act(
      () => apiRequest(`/api/admin/admins/${admin.id}`, { method: 'DELETE' }),
      admin.id,
      'Admin deleted.',
    );
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest('/api/admin/admins', { method: 'POST', body: form });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Admin created.');
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create the admin.'));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof EMPTY_FORM) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">Admins</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Add admin'}
        </button>
      </div>

      {message ? <Banner kind="success">{message}</Banner> : null}

      {showForm ? (
        <form className="card stack" onSubmit={(e) => void create(e)}>
          <Field label="Name" htmlFor="adm-name">
            <input id="adm-name" className="input" required value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="adm-email">
            <input id="adm-email" className="input" type="email" required value={form.email} onChange={(e) => set('email')(e.target.value)} />
          </Field>
          <Field label="Mobile (optional)" htmlFor="adm-phone">
            <input id="adm-phone" className="input" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
          </Field>
          <Field label="Temporary password" htmlFor="adm-pass" hint="Share it with them; they can change it from Profile.">
            <input id="adm-pass" className="input" type="text" minLength={8} required value={form.password} onChange={(e) => set('password')(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="adm-role">
            <select id="adm-role" className="input" value={form.role} onChange={(e) => set('role')(e.target.value)}>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super admin</option>
            </select>
          </Field>
          {formError ? <Banner kind="danger">{formError}</Banner> : null}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create admin'}
          </button>
        </form>
      ) : null}

      {data === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(data?.items ?? []).map((admin) => (
            <div key={admin.id} className="card">
              <div className="card-header-row">
                <p className="text-small-bold">{admin.name ?? '(no name)'}</p>
                <Pill label={admin.isActive ? 'Active' : 'Blocked'} tone={admin.isActive ? 'done' : 'bad'} />
              </div>
              <p className="text-small text-secondary">{admin.email}</p>
              <p className="text-small text-secondary">
                {admin.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
                {admin.lastLoginAt ? ` · last sign-in ${formatIstDateTime(admin.lastLoginAt)}` : ' · never signed in'}
              </p>
              <p className="text-small text-secondary">
                Reviewed {admin.activity.bookingsReviewed} bookings, {admin.activity.passesReviewed} passes · resolved{' '}
                {admin.activity.complaintsResolved} complaints
              </p>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary" disabled={busyId === admin.id} onClick={() => toggleBlock(admin)}>
                  {admin.isActive ? 'Block' : 'Unblock'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busyId === admin.id} onClick={() => resetPassword(admin)}>
                  Reset password
                </button>
                <button type="button" className="btn btn-danger" disabled={busyId === admin.id} onClick={() => remove(admin)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-small-bold">Account activity log</p>
      <div className="stack">
        {(data?.auditEvents ?? []).map((event) => (
          <div key={event.id} className="card">
            <p className="text-small">
              <strong>{event.action.replace('_', ' ')}</strong> · {event.targetEmail}
            </p>
            <p className="text-small text-secondary">
              by {event.actorEmail} · {formatIstDateTime(event.createdAt)}
              {event.note ? ` · ${event.note}` : ''}
            </p>
          </div>
        ))}
        {data && data.auditEvents.length === 0 ? <div className="empty-state">No activity yet.</div> : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
