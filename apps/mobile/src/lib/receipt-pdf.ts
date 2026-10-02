/**
 * Builds the printable HTML `expo-print` turns into the receipt PDF (UI-03).
 *
 * A plain string template rather than a shared React component with
 * `receipt.tsx`: `expo-print` renders this inside its own offscreen WebView, not
 * the app's React tree, so there is no component to share in the first place —
 * only the data and the visual language (sections, the PAID stamp) are meant to
 * match, which this file mirrors by hand.
 *
 * Every value comes straight from the already-fetched `Receipt` — no new
 * request, no recomputed amount or status (the Phase 08 constraint UI-03 must
 * not regress).
 *
 * Colors are the light-mode tokens from `constants/theme.ts`, hardcoded rather
 * than imported: a PDF has no dark mode to react to (the same reasoning
 * `brand-header.tsx` gives for its PNG mark being colour-fixed), so there is
 * nothing a theme import would buy here, only a dependency on a module shaped
 * for React Native's `StyleSheet`.
 */
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstDateTime,
  type BookingStatus,
  type PaymentStatus,
  type Receipt,
} from '@parking/shared';

type Tone = 'done' | 'waiting' | 'bad';

const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  PENDING: 'waiting',
  PENDING_PAYMENT: 'waiting',
  PAYMENT_VERIFICATION: 'waiting',
  PENDING_APPROVAL: 'waiting',
  CONFIRMED: 'done',
  COMPLETED: 'done',
  REJECTED: 'bad',
  CANCELLED: 'bad',
  EXPIRED: 'bad',
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'waiting',
  VERIFICATION_PENDING: 'waiting',
  PAID: 'done',
  FAILED: 'bad',
  REJECTED: 'bad',
  REFUNDED: 'bad',
};

const TONE_COLOR: Record<Tone, string> = {
  done: '#0E7A4B',
  waiting: '#9A5B00',
  bad: '#D92D20',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pill(label: string, tone: Tone): string {
  const color = TONE_COLOR[tone];
  return `<span class="pill" style="color:${color};background:${color}1F;border-color:${color}4D;">${escapeHtml(label)}</span>`;
}

type Row = { label: string; value: string };

function section(title: string, rows: Row[]): string {
  const rowsHtml = rows
    .map(
      (row) =>
        `<div class="row"><span class="rowLabel">${escapeHtml(row.label)}</span><span class="rowValue">${escapeHtml(row.value)}</span></div>`,
    )
    .join('');
  return `<section class="card"><h2 class="sectionTitle">${escapeHtml(title)}</h2>${rowsHtml}</section>`;
}

/** Builds the full HTML document `Print.printAsync`/`printToFileAsync` render. */
export function buildReceiptHtml(receipt: Receipt): string {
  const locationRows: Row[] = [
    { label: 'Location', value: `${receipt.location.name}, ${receipt.location.city}` },
    { label: 'Address', value: receipt.location.addressLine },
  ];

  const customerRows: Row[] = [
    { label: 'Customer', value: receipt.customer.name ?? receipt.customer.email },
    ...(receipt.customer.phone ? [{ label: 'Contact', value: receipt.customer.phone }] : []),
    { label: 'Vehicle number', value: receipt.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[receipt.vehicleType] },
  ];

  const bookingRows: Row[] = [
    { label: 'Booking date', value: formatIstDate(receipt.bookingDate) },
    { label: 'Entry time', value: formatIstDateTime(receipt.startTime) },
    { label: 'Valid until', value: formatIstDateTime(receipt.endTime) },
    { label: 'Package', value: receipt.rateLabel },
  ];

  const amountRows: Row[] = [
    { label: 'Amount', value: formatInr(receipt.amountInPaise) },
    {
      label: 'Payment method',
      value: receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : 'Not chosen yet',
    },
  ];

  const paymentStatusPill = receipt.paymentStatus
    ? pill(PAYMENT_STATUS_LABELS[receipt.paymentStatus], PAYMENT_STATUS_TONE[receipt.paymentStatus])
    : '<span class="muted">Not started</span>';

  const watermark =
    receipt.paymentStatus === 'PAID'
      ? '<div class="watermark">PAID</div>'
      : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light" />
<style>
  * { box-sizing: border-box; }
  /* A printed receipt is always light paper — it must not follow the
     viewing device's dark-mode preference the way the app itself does. */
  html { color-scheme: light; }
  body {
    font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #000000;
    margin: 0;
    padding: 32px;
    position: relative;
  }
  .watermark {
    /* absolute, not fixed: this document can run longer than one printed
       page, and fixed pins to the viewport rather than the page — it would
       only ever paint on the first page instead of scrolling/repaginating
       with the content it is a watermark for. absolute against body
       (itself position: relative) places it once, centered on the whole
       document's actual height. */
    position: absolute;
    top: 45%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-28deg);
    font-size: 110px;
    font-weight: 800;
    letter-spacing: 10px;
    color: #0E7A4B;
    opacity: 0.12;
    z-index: 0;
    pointer-events: none;
  }
  .content { position: relative; z-index: 1; }
  .header {
    text-align: center;
    margin-bottom: 24px;
  }
  .businessName { font-size: 22px; font-weight: 700; margin: 0; }
  .tagline {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #60646C;
    margin: 4px 0 0;
  }
  .bookingNumberLabel {
    font-size: 12px;
    color: #60646C;
    margin: 20px 0 4px;
  }
  .bookingNumber {
    font-size: 28px;
    font-weight: 700;
    color: #0B5FA5;
    margin: 0 0 10px;
  }
  .card {
    /* No fill, border only: the watermark sits behind every section (z-index
       0 vs .content's z-index 1), and an opaque card background would hide
       almost all of it — only the row text itself needs to stay opaque for
       "never obscuring text", not the card's own surface. */
    background: transparent;
    border: 1px solid #D7DAE0;
    border-radius: 12px;
    padding: 4px 16px;
    margin-bottom: 16px;
  }
  .sectionTitle {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #0B5FA5;
    padding: 12px 0 8px;
    margin: 0;
    border-bottom: 1px solid #D7DAE0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-top: 1px solid #D7DAE0;
    font-size: 13px;
  }
  .row:first-of-type { border-top: none; }
  .rowLabel { color: #60646C; flex-shrink: 0; }
  .rowValue { text-align: right; font-weight: 600; }
  .pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 700;
  }
  .muted { color: #60646C; }
  .footer {
    text-align: center;
    color: #60646C;
    font-size: 11px;
    margin-top: 16px;
  }
</style>
</head>
<body>
  ${watermark}
  <div class="content">
    <div class="header">
      <p class="businessName">${escapeHtml(receipt.business.name)}</p>
      <p class="tagline">Digital Parking Receipt</p>
      <p class="bookingNumberLabel">Booking number</p>
      <p class="bookingNumber">${escapeHtml(receipt.bookingNumber)}</p>
      ${pill(BOOKING_STATUS_LABELS[receipt.status], BOOKING_STATUS_TONE[receipt.status])}
    </div>

    ${section('Location', locationRows)}
    ${section('Customer & vehicle', customerRows)}
    ${section('Booking', bookingRows)}

    <section class="card">
      <h2 class="sectionTitle">Payment</h2>
      ${amountRows
        .map(
          (row) =>
            `<div class="row"><span class="rowLabel">${escapeHtml(row.label)}</span><span class="rowValue">${escapeHtml(row.value)}</span></div>`,
        )
        .join('')}
      <div class="row"><span class="rowLabel">Payment status</span><span class="rowValue">${paymentStatusPill}</span></div>
    </section>

    ${
      receipt.business.supportPhone
        ? `<p class="footer">Support: ${escapeHtml(receipt.business.supportPhone)}</p>`
        : ''
    }
  </div>
</body>
</html>`;
}
