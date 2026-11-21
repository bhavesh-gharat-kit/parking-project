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
import { Pagination } from '../../_components/Pagination';
import { ComplaintStatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';
import { usePagination } from '../../_lib/use-pagination';

export default function AdminComplaintsPage() {
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [complaints, setComplaints] = useState<AdminComplaint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, changePageSize, resetPage, begin, isCurrent } = usePagination(20);

  const load = useCallback(async () => {
    const requestId = begin();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const result = await apiRequest<Paginated<AdminComplaint>>(`/api/admin/complaints?${params.toString()}`);
      if (!isCurrent(requestId)) return;
      setComplaints(result.items);
      setTotal(result.total);
    } catch (error) {
      if (isCurrent(requestId)) setLoadError(errorMessage(error, 'Could not load complaints.'));
    } finally {
      if (isCurrent(requestId)) setLoading(false);
    }
  }, [status, search, page, pageSize, begin, isCurrent]);

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
        <button type="button" className={`chip${status === '' ? ' selected' : ''}`} onClick={() => {
            setStatus('');
            resetPage();
          }}
        >
          All
        </button>
        {COMPLAINT_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${status === value ? ' selected' : ''}`}
            onClick={() => {
              setStatus(value);
              resetPage();
            }}
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
          resetPage();
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

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
        disabled={loading}
      />

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
