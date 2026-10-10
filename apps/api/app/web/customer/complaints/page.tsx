'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatIstDate, type Complaint, type Paginated } from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { ComplaintStatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function MyComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await apiRequest<Paginated<Complaint>>('/api/complaints?pageSize=50');
      setComplaints(page.items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load your complaints.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry calls the same stable callback outside an effect
    void load();
  }, [load]);

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">My complaints</h1>
        <Link href="/web/customer/complaints/new" className="btn btn-primary">
          Raise complaint
        </Link>
      </div>

      {complaints === null && !loadError ? <div className="loading-center">Loading…</div> : null}

      <div className="stack">
        {(complaints ?? []).map((complaint) => (
          <Link key={complaint.id} href={`/web/customer/complaints/${complaint.id}`} className="card-link">
            <div className="card">
              <div className="card-header-row">
                <p className="text-small-bold">{complaint.title}</p>
                <ComplaintStatusPill status={complaint.status} />
              </div>
              <p className="text-small text-secondary">
                {complaint.ticket} · {formatIstDate(complaint.createdAt)}
              </p>
            </div>
          </Link>
        ))}
        {complaints !== null && complaints.length === 0 ? (
          <div className="empty-state">You haven&apos;t raised any complaints.</div>
        ) : null}
      </div>

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}
