import {
  BOOKING_STATUS_LABELS,
  PASS_BOOKING_STATUS_LABELS,
  type BookingStatus,
  type PassBookingStatus,
  type PaymentStatus,
  PAYMENT_STATUS_LABELS,
} from '@parking/shared';

export type Tone = 'done' | 'waiting' | 'bad';

type PillProps = {
  label: string;
  tone: Tone;
  large?: boolean;
};

export function Pill({ label, tone, large }: PillProps) {
  return <span className={`pill pill-${tone}${large ? ' pill-large' : ''}`}>{label}</span>;
}

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

export function StatusPill({ status, large }: { status: BookingStatus; large?: boolean }) {
  return <Pill label={BOOKING_STATUS_LABELS[status]} tone={BOOKING_STATUS_TONE[status]} large={large} />;
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'waiting',
  VERIFICATION_PENDING: 'waiting',
  PAID: 'done',
  FAILED: 'bad',
  REJECTED: 'bad',
  REFUNDED: 'bad',
};

export function PaymentStatusPill({ status, large }: { status: PaymentStatus; large?: boolean }) {
  return <Pill label={PAYMENT_STATUS_LABELS[status]} tone={PAYMENT_STATUS_TONE[status]} large={large} />;
}

const PASS_BOOKING_STATUS_TONE: Record<PassBookingStatus, Tone> = {
  PENDING: 'waiting',
  PENDING_PAYMENT: 'waiting',
  PAYMENT_VERIFICATION: 'waiting',
  PENDING_APPROVAL: 'waiting',
  CONFIRMED: 'done',
  REJECTED: 'bad',
  CANCELLED: 'bad',
};

export function PassStatusPill({ status, large }: { status: PassBookingStatus; large?: boolean }) {
  return (
    <Pill label={PASS_BOOKING_STATUS_LABELS[status]} tone={PASS_BOOKING_STATUS_TONE[status]} large={large} />
  );
}
