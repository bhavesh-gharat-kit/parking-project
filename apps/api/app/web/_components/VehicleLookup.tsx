'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  VEHICLE_LOOKUP_MIN_QUERY_LENGTH,
  VEHICLE_LOOKUP_STATE_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstRange,
  normalizePlateQuery,
  type VehicleLookupMatch,
  type VehicleLookupResponse,
  type VehicleLookupState,
} from '@parking/shared';

import { apiRequest, errorMessage } from '../_lib/api';
import { Pill, type Tone } from './Pill';

const DEBOUNCE_MS = 250;

const STATE_TONE: Record<VehicleLookupState, Tone> = {
  ACTIVE: 'done',
  UPCOMING: 'waiting',
  EXPIRED: 'bad',
};

function validityText(match: VehicleLookupMatch): string {
  // A pass is valid for whole IST days; showing its clock times would read as
  // "midnight to 11:59 pm" noise.
  return match.kind === 'PASS'
    ? `${formatIstDate(match.startsAt)} – ${formatIstDate(match.endsAt)}`
    : formatIstRange(match.startsAt, match.endsAt);
}

function MatchCard({ match, onNavigate }: { match: VehicleLookupMatch; onNavigate: () => void }) {
  const href = `/web/admin/${match.kind === 'PASS' ? 'passes' : 'bookings'}/${match.id}`;
  return (
    <div className="card">
      <div className="card-header-row">
        <p className="lookup-plate">{match.vehicleNumber}</p>
        <Pill label={VEHICLE_LOOKUP_STATE_LABELS[match.state]} tone={STATE_TONE[match.state]} large />
      </div>
      <p className="text-small-bold">
        {match.kind === 'PASS' ? 'Pass' : 'Daily booking'} · {match.planLabel} ·{' '}
        {VEHICLE_TYPE_LABELS[match.vehicleType]}
      </p>
      <p className="text-small">Valid: {validityText(match)}</p>
      <p className="text-small text-secondary">
        {match.customerName ?? 'Unnamed customer'} · {match.locationName} ·{' '}
        {formatInr(match.amountInPaise)}
      </p>
      <div className="card-header-row">
        {match.customerPhone ? (
          <a className="btn btn-secondary" href={`tel:${match.customerPhone}`}>
            Call {match.customerPhone}
          </a>
        ) : (
          <span className="text-small text-secondary">No phone on file</span>
        )}
        <Link href={href} className="btn btn-ghost" onClick={onNavigate}>
          {match.reference}
        </Link>
      </div>
    </div>
  );
}

/**
 * Admin-wide "find a vehicle" sheet: a floating button on every admin page
 * opens a search box that answers with the vehicle's active pass/booking.
 * Typing only for now; the lookup contract (`vehicle-lookup.ts`) takes the same
 * `q` a spoken plate would produce.
 */
export function VehicleLookup() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<VehicleLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = normalizePlateQuery(input);
  const searchable = query.length >= VEHICLE_LOOKUP_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Stop the page behind the sheet from scrolling on a phone.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<VehicleLookupResponse>(
          `/api/admin/vehicle-lookup?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        setResult(data);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(errorMessage(caught, 'Could not look that vehicle up.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchable, query]);

  const showResult = searchable && result?.query === query;

  return (
    <>
      <button type="button" className="lookup-fab" onClick={() => setOpen(true)}>
        Find vehicle
      </button>

      {open ? (
        <div className="lookup-overlay" role="dialog" aria-modal="true" aria-label="Find a vehicle">
          <div className="lookup-sheet">
            <div className="card-header-row">
              <h2 className="text-heading">Find vehicle</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <input
              ref={inputRef}
              className="input lookup-input"
              placeholder="Plate or last digits, e.g. 1234"
              value={input}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setInput(event.target.value)}
            />

            <div className="stack lookup-results">
              {!searchable ? (
                <p className="text-small text-secondary">
                  Enter at least {VEHICLE_LOOKUP_MIN_QUERY_LENGTH} characters of the vehicle number.
                </p>
              ) : error ? (
                <p className="field-error">{error}</p>
              ) : loading && !showResult ? (
                <div className="loading-center">Searching…</div>
              ) : showResult && result.matches.length === 0 ? (
                <div className="empty-state">
                  No active pass or booking found for “{query}”.
                </div>
              ) : showResult ? (
                result.matches.map((match) => (
                  <MatchCard
                    key={`${match.kind}-${match.id}`}
                    match={match}
                    onNavigate={() => setOpen(false)}
                  />
                ))
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
