/**
 * The ONLY place in this codebase that writes `Booking.status` or
 * `Payment.status`.
 *
 * `packages/shared/src/bookings.ts` says which moves are legal; this module
 * performs one, and in doing so guarantees the four things a caller would
 * otherwise have to remember:
 *
 *  1. **The move is legal.** Checked against `BOOKING_TRANSITIONS` /
 *     `PAYMENT_TRANSITIONS`, not against whatever the handler assumed.
 *  2. **It is atomic and race-safe.** The status is written with a conditional
 *     `updateMany` guarded on the status that was read, so two concurrent
 *     requests — the §15 sweep and a customer submitting a UTR are the realistic
 *     pair — cannot both win. The loser gets `RACED` and can re-read, instead of
 *     stamping `EXPIRED` over a booking that just moved to
 *     `PAYMENT_VERIFICATION`.
 *  3. **The audit trail is written.** A `BookingStatusEvent` row per transition
 *     (§21). This system confirms bookings on an admin's word, so "who moved
 *     this, when, and with what note" is evidence, not telemetry — which is
 *     exactly why it is written in the same transaction as the status itself and
 *     not left to each caller.
 *  4. **The right timestamps are stamped.** `confirmedAt`/`rejectedAt`/… follow
 *     from the target status declaratively (`STATUS_TIMESTAMP` below), and
 *     `expiresAt` is cleared the moment the booking stops being the customer's
 *     to finish.
 *
 * Phases 06-08 call `transitionBooking` and add nothing to this file beyond, at
 * most, a new field in `TransitionData`.
 */
import {
  canTransitionBooking,
  canTransitionPayment,
  isSweepableBookingStatus,
  type BookingStatus,
  type PaymentMethod,
  type PaymentStatus,
  type UserRole,
} from '@parking/shared';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { BOOKING_RELATIONS, type BookingWithRelations } from './projection';

/** Who is making the move. `null` means the system — i.e. the §15 expiry sweep. */
export type TransitionActor = { userId: string; role: UserRole } | null;

/**
 * Booking columns a transition may set alongside the status. Deliberately
 * narrow: `status`, `amountInPaise`, `startTime` and the snapshot columns are
 * absent, so no transition can quietly reprice a booking (§32) or contradict
 * the status it is about to write.
 */
export type TransitionData = {
  /** Phase 06 — set once, when the customer picks UPI or cash. */
  paymentMethod?: PaymentMethod;
  /** Phase 07 — the admin's note on an approval or a rejection (§21). */
  reviewNote?: string | null;
  /** Free-text operational note from the gate. */
  notes?: string | null;
};

export type TransitionRequest = {
  bookingId: string;
  /** The status to move to. Rejected unless the table allows it from the current one. */
  to: BookingStatus;
  /**
   * The money side of the same move, when there is one — e.g. Phase 07
   * approving a cash booking moves `PENDING_APPROVAL → CONFIRMED` *and*
   * `PENDING → PAID`. Optional and independent: most transitions touch one axis
   * only (§32), and a booking with no `Payment` row yet has no payment status to
   * move.
   */
  payment?: {
    to: PaymentStatus;
    /** Stamps `Payment.paidAt`; Phase 07 passes the moment the cash was taken. */
    paidAt?: Date;
    /** Stamps `Payment.verifiedById`/`verifiedAt` from the acting admin. */
    recordVerifier?: boolean;
  };
  actor: TransitionActor;
  /** Goes on the audit row, and on `reviewNote` if `data.reviewNote` is unset. */
  note?: string;
  data?: TransitionData;
  /**
   * Restricts the move to these current statuses on top of the table's own
   * rules. The sweep passes `SWEEPABLE_BOOKING_STATUSES` so that a booking
   * sitting in `PAYMENT_VERIFICATION` can never be expired even though the
   * candidate query and the update are not one statement.
   */
  allowedFrom?: readonly BookingStatus[];
};

export type TransitionFailure =
  | { ok: false; reason: 'NOT_FOUND' }
  /** The table forbids it, or `allowedFrom` excluded the current status. */
  | { ok: false; reason: 'ILLEGAL_STATUS'; from: BookingStatus; to: BookingStatus }
  /** A payment move was asked for on a booking that has no `Payment` row yet. */
  | { ok: false; reason: 'NO_PAYMENT' }
  | { ok: false; reason: 'ILLEGAL_PAYMENT_STATUS'; from: PaymentStatus; to: PaymentStatus }
  /** Someone else moved the row between the read and the write. Re-read and retry. */
  | { ok: false; reason: 'RACED'; from: BookingStatus };

export type TransitionResult =
  | { ok: true; booking: BookingWithRelations }
  | TransitionFailure;

/**
 * Target status → the column that records when it happened.
 *
 * `PENDING`, `PENDING_PAYMENT`, `PAYMENT_VERIFICATION` and `PENDING_APPROVAL`
 * are absent on purpose: they are waiting states whose "when" is already
 * `createdAt` or the audit trail, and adding a column per waiting state would be
 * four more things to keep consistent for no query anyone runs.
 */
const STATUS_TIMESTAMP = {
  CONFIRMED: 'confirmedAt',
  REJECTED: 'rejectedAt',
  CANCELLED: 'cancelledAt',
  COMPLETED: 'completedAt',
  EXPIRED: 'expiredAt',
} as const satisfies Partial<Record<BookingStatus, keyof Prisma.BookingUncheckedUpdateManyInput>>;

/** Statuses that mean an admin made a decision, so `reviewedBy*` is stamped (§21). */
const REVIEWED_STATUSES: readonly BookingStatus[] = ['CONFIRMED', 'REJECTED'];

/**
 * Applies one transition.
 *
 * Read → check → conditional write → audit, all inside a transaction. The read
 * is inside the transaction as well, so `from` in a `RACED` failure is a status
 * the row genuinely held rather than a guess.
 */
export async function transitionBooking(request: TransitionRequest): Promise<TransitionResult> {
  const { bookingId, to, actor, note, data, payment, allowedFrom } = request;

  return prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({
      where: { id: bookingId },
      // Only what the checks below need: the current status, and the payment row's
      // id and status if there is one.
      select: {
        id: true,
        status: true,
        payment: { select: { id: true, status: true } },
      },
    });

    if (!current) return { ok: false, reason: 'NOT_FOUND' } as const;

    const from = current.status;

    if (!canTransitionBooking(from, to) || (allowedFrom && !allowedFrom.includes(from))) {
      return { ok: false, reason: 'ILLEGAL_STATUS', from, to } as const;
    }

    let paymentFrom: PaymentStatus | null = null;
    if (payment) {
      if (!current.payment) return { ok: false, reason: 'NO_PAYMENT' } as const;

      paymentFrom = current.payment.status;
      // A no-op payment move (PAID → PAID on a retried request) is allowed
      // through; the table only governs actual changes.
      if (paymentFrom !== payment.to && !canTransitionPayment(paymentFrom, payment.to)) {
        return {
          ok: false,
          reason: 'ILLEGAL_PAYMENT_STATUS',
          from: paymentFrom,
          to: payment.to,
        } as const;
      }
    }

    const now = new Date();

    // The `Unchecked…` variant is the one that exposes `reviewedById` as a plain
    // column rather than a `reviewedBy: { connect }` relation write — the actor
    // here is already a verified user id, so connecting through the relation would
    // only add a lookup.
    const bookingData: Prisma.BookingUncheckedUpdateManyInput = {
      status: to,
      // §15 — the 10-minute hold belongs to the customer's part of the flow. The
      // moment the booking is waiting on an admin, or is over, there is nothing
      // for the sweep to reclaim and a stale `expiresAt` would only be a trap for
      // a future query. Note the window is NOT refreshed on the way through:
      // it runs from creation, so re-picking a payment method cannot hold a
      // booking open indefinitely.
      ...(isSweepableBookingStatus(to) ? {} : { expiresAt: null }),
      ...(data?.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
      ...(data?.notes !== undefined ? { notes: data.notes } : {}),
    };

    const timestampColumn = STATUS_TIMESTAMP[to as keyof typeof STATUS_TIMESTAMP];
    if (timestampColumn) {
      Object.assign(bookingData, { [timestampColumn]: now });
    }

    if (REVIEWED_STATUSES.includes(to)) {
      bookingData.reviewedAt = now;
      bookingData.reviewedById = actor?.userId ?? null;
      bookingData.reviewNote = data?.reviewNote ?? note ?? null;
    } else if (data?.reviewNote !== undefined) {
      bookingData.reviewNote = data.reviewNote;
    }

    // The compare-and-swap. `status: from` is the whole point: if anything moved
    // this row since the read above, zero rows match and the transaction rolls
    // back without having written an audit entry for a change that did not happen.
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: from },
      data: bookingData,
    });

    if (updated.count === 0) return { ok: false, reason: 'RACED', from } as const;

    if (payment && current.payment && paymentFrom !== null) {
      await tx.payment.update({
        where: { id: current.payment.id },
        data: {
          status: payment.to,
          ...(payment.to === 'PAID' ? { paidAt: payment.paidAt ?? now } : {}),
          ...(payment.to === 'REFUNDED' ? { refundedAt: now } : {}),
          ...(payment.recordVerifier
            ? { verifiedById: actor?.userId ?? null, verifiedAt: now }
            : {}),
          ...(note !== undefined ? { reviewNote: note } : {}),
        },
      });
    }

    await tx.bookingStatusEvent.create({
      data: {
        bookingId,
        fromStatus: from,
        toStatus: to,
        fromPaymentStatus: paymentFrom,
        toPaymentStatus: payment?.to ?? null,
        // NULL actor is the system, i.e. the sweep — see the schema comment.
        actorId: actor?.userId ?? null,
        actorRole: actor?.role ?? null,
        note: note ?? null,
      },
    });

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: BOOKING_RELATIONS,
    });

    return { ok: true, booking } as const;
  });
}

/**
 * The message for a failed transition, written to be read by a customer.
 *
 * Centralised so Phases 06-08 answer a stale tap the same way this phase does.
 * `RACED` reads as a refresh prompt rather than an error because that is what it
 * is: the booking did change, just not the way this request expected.
 */
export function transitionFailureMessage(failure: TransitionFailure): string {
  switch (failure.reason) {
    case 'NOT_FOUND':
      return 'That booking could not be found.';
    case 'RACED':
      return 'This booking was just updated. Pull to refresh and try again.';
    case 'NO_PAYMENT':
      return 'No payment has been started for this booking yet.';
    case 'ILLEGAL_PAYMENT_STATUS':
      return 'That payment update is not possible for this booking any more.';
    case 'ILLEGAL_STATUS':
      return 'That is no longer possible for this booking.';
  }
}
