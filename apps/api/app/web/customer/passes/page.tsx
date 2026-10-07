'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PAYMENT_STATUS_LABELS,
  formatInr,
  formatIstDate,
  isPassExpired,
  type Paginated,
  type PassBooking,
} from '@parking/shared';

import { Banner } from '../../_components/Banner';
import { PassStatusPill } from '../../_components/Pill';
import { apiRequest, errorMessage } from '../../_lib/api';

export default function PassesListPage() {
  const [passes, setPasses] = useState<PassBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await apiRequest<Paginated<PassBooking>>('/api/passes');
        if (!cancelled) setPasses(page.items);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error, 'Could not load your passes.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // D5 point 3 — "active" vs. "past" is always this read-time comparison
  // against `endDate`, never a stored status.
  const active = (passes ?? []).filter((pass) => !isPassExpired(pass.endDate));
  const past = (passes ?? []).filter((pass) => isPassExpired(pass.endDate));

  return (
    <div className="stack-loose">
      <div className="card-header-row">
        <h1 className="text-heading">My passes</h1>
        <Link href="/web/customer/passes/new" className="btn btn-primary">
          Apply for a pass
        </Link>
      </div>

      {passes === null && !loadError ? (
        <div className="loading-center">Loading…</div>
      ) : (
        <>
          <div className="stack">
            {active.map((pass) => (
              <PassCard key={pass.id} pass={pass} />
            ))}
            {passes !== null && active.length === 0 ? (
              <div className="empty-state">No active passes. Apply for one and it will show up here.</div>
            ) : null}
          </div>

          {past.length > 0 ? (
            <>
              <h2 className="text-subtitle">Past passes</h2>
              <div className="stack">
                {past.map((pass) => (
                  <PassCard key={pass.id} pass={pass} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {loadError ? <Banner kind="danger">{loadError}</Banner> : null}
    </div>
  );
}

function PassCard({ pass }: { pass: PassBooking }) {
  const confirmed = pass.status === 'CONFIRMED';
  const expired = isPassExpired(pass.endDate);

  return (
    // A nested <a> inside <a> is invalid HTML, so the card-to-detail link and
    // the "View pass" link are siblings here, not parent/child, even though
    // they sit inside one visual card (same pattern as the bookings list).
    <div className="card">
      <Link href={`/web/customer/passes/${pass.id}`} className="card-click-area">
        <div className="card-header-row">
          <p className="text-small-bold">{pass.passNumber}</p>
          <p className="text-small-bold text-primary">{formatInr(pass.amountInPaise)}</p>
        </div>
        <p className="text-small text-secondary">
          {pass.location.name} · {pass.vehicleNumber} · {pass.planLabel}
        </p>
        <p className="text-small text-secondary">
          {formatIstDate(pass.startDate)} – {formatIstDate(pass.endDate)}
        </p>
        <div className="card-header-row">
          <span className="chip-row" style={{ gap: 'var(--space-1)' }}>
            <PassStatusPill status={pass.status} />
            {confirmed ? (
              <span className={`pill ${expired ? 'pill-bad' : 'pill-done'}`}>{expired ? 'Expired' : 'Active'}</span>
            ) : null}
          </span>
          {pass.payment ? (
            <span className="text-small text-secondary">
              Payment: {PAYMENT_STATUS_LABELS[pass.payment.status]}
            </span>
          ) : null}
        </div>
      </Link>
      {confirmed ? (
        <Link href={`/web/customer/passes/${pass.id}/pass`} className="text-small text-primary">
          View pass / Download
        </Link>
      ) : null}
      {confirmed && expired ? (
        <Link
          href={`/web/customer/passes/new/${pass.location.id}?renewFrom=${pass.id}`}
          className="text-small text-primary"
        >
          Renew
        </Link>
      ) : null}
    </div>
  );
}
