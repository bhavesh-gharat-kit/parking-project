import { COMPLAINT_STATUS_LABELS, formatIstDateTime, type Complaint } from '@parking/shared';

import { ComplaintStatusPill } from './Pill';

/** The read-only body of a complaint, shared by the customer and admin detail pages. */
export function ComplaintDetail({ complaint }: { complaint: Complaint }) {
  return (
    <>
      <div className="card stack">
        <div className="card-header-row">
          <p className="text-small-bold">{complaint.ticket}</p>
          <ComplaintStatusPill status={complaint.status} large />
        </div>
        <h1 className="text-heading">{complaint.title}</h1>
        <p className="text-small text-secondary">Raised {formatIstDateTime(complaint.createdAt)}</p>
        <p className="text-small" style={{ whiteSpace: 'pre-wrap' }}>
          {complaint.description}
        </p>
      </div>

      {complaint.imageUrls.length > 0 ? (
        <div className="card stack">
          <p className="text-small-bold">Attached images</p>
          <div className="stack">
            {complaint.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote user upload, size/host not known to next/image */}
                <img src={url} alt="Complaint attachment" className="screenshot-preview" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {complaint.resolutionNote ? (
        <div className="card stack">
          <p className="text-small-bold">Response from the parking office</p>
          <p className="text-small" style={{ whiteSpace: 'pre-wrap' }}>
            {complaint.resolutionNote}
          </p>
        </div>
      ) : null}

      <div className="card stack">
        <p className="text-small-bold">History</p>
        {complaint.events.map((event) => (
          <div className="card-row" key={event.id}>
            <span className="card-row-label">{formatIstDateTime(event.createdAt)}</span>
            <span className="card-row-value">
              {COMPLAINT_STATUS_LABELS[event.toStatus]}
              {event.note ? ` — ${event.note}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
