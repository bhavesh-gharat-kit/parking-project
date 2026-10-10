'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Complaint } from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { ComplaintDetail } from '../../../_components/ComplaintDetail';
import { apiRequest, errorMessage } from '../../../_lib/api';

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await apiRequest<Complaint>(`/api/complaints/${id}`);
        if (!cancelled) setComplaint(row);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load this complaint.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="stack-loose">
      <Link href="/web/customer/complaints" className="text-small">
        ← All complaints
      </Link>
      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
      {!complaint && !loadError ? <div className="loading-center">Loading…</div> : null}
      {complaint ? <ComplaintDetail complaint={complaint} /> : null}
    </div>
  );
}
