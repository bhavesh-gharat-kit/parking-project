'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  formatIstDate,
  type AdminComplaint,
  type ComplaintStatus,
  type Paginated,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { ComplaintStatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function AdminComplaintsPage() {
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [complaints, setComplaints] = useState<AdminComplaint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const page = await apiRequest<Paginated<AdminComplaint>>(`/api/admin/complaints?${params.toString()}`);
      setComplaints(page.items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load complaints.'));
    }
  }, [status, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-filter-change; the callback is stable via useCallback
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">Complaints</h1>
        <Link href="/web/admin/complaints/categories" className="btn btn-secondary">
          Manage issue titles
        </Link>
      </div>

      <div className="chip-row">
        <button type="button" className={`chip${status === '' ? ' selected' : ''}`} onClick={() => setStatus('')}>
          All
        </button>
        {COMPLAINT_STATUSES.map((value) => (
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

      <form
        className="filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <input
          className="input"
          placeholder="Search title, description or user"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      {complaints === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <div className="stack">
          {(complaints ?? []).map((complaint) => (
            <Link key={complaint.id} href={`/web/admin/complaints/${complaint.id}`} className="card-link">
              <div className="card">
                <div className="card-header-row">
                  <p className="text-small-bold">{complaint.title}</p>
                  <ComplaintStatusPill status={complaint.status} />
                </div>
                <p className="text-small text-secondary">
                  {complaint.ticket} · {complaint.user.name ?? complaint.user.email} ·{' '}
                  {formatIstDate(complaint.createdAt)}
                </p>
              </div>
            </Link>
          ))}
          {complaints !== null && complaints.length === 0 ? (
            <div className="empty-state">No complaints found.</div>
          ) : null}
        </div>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
