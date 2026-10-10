/**
 * The ONLY place in this codebase that writes `PassBooking.status` or
 * `PassPayment.status`. Mirrors `lib/bookings/transitions.ts` exactly — see
 * that file's header for the four guarantees this gives every caller
 * (legality against `PASS_BOOKING_TRANSITIONS`/`PAYMENT_TRANSITIONS`,
 * atomic race-safety via a conditional `updateMany`, the `PassStatusEvent`
 * audit row, and the right timestamp column).
 *
 * Narrower than the booking version in two ways, both from D5: there is no
 * `COMPLETED`/`EXPIRED` status to stamp a timestamp for, and `PassStatusEvent`
 * has no `fromPaymentStatus`/`toPaymentStatus` columns (those only exist on
 * `BookingStatusEvent`).
 */
import {
  canTransitionPassBooking,
  canTransitionPayment,
  isSweepablePassBookingStatus,
  type PassBookingStatus,
  type PassEntrySide,
  type PassSpecification,
  type PaymentMethod,
  type PaymentStatus,
  type UserRole,
} from '@parking/shared';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { PASS_RELATIONS, type PassBookingWithRelations } from './projection';

/** Who is making the move. `null` means the system — i.e. the D5 point 9 expiry sweep. */
export type PassTransitionActor = { userId: string; role: UserRole } | null;

/**
 * `PassBooking` columns a transition may set alongside the status.
 * Deliberately narrow — `status`, `amountInPaise`, `startDate`/`endDate` and
 * the other snapshot columns are absent, so no transition can quietly
 * reprice or re-date a pass (D5 point 3).
 */
export type PassTransitionData = {
  /** Phase 20 — set once, when the customer picks UPI or cash. */
  paymentMethod?: PaymentMethod;
  /** Phase 21 — the admin's note on an approval or a rejection. */
  reviewNote?: string | null;
  /** Phase 21 — optionally set at approval time (D5 point 6); otherwise left
   *  for a later `PATCH /api/admin/passes/:id` (`lib/passes/edit.ts`). */
  specification?: PassSpecification;
  entrySide?: PassEntrySide;
};

export type PassTransitionRequest = {
  passBookingId: string;
  to: PassBookingStatus;
  /**
   * The money side of the same move, when there is one — mirrors
   * `TransitionRequest['payment']` in `lib/bookings/transitions.ts`.
   */
  payment?: {
    to: PaymentStatus;
    paidAt?: Date;
    recordVerifier?: boolean;
    upiUtr?: string;
    utrScreenshotUrl?: string;
    create?: {
      method: PaymentMethod;
      amountInPaise: number;
      upiPayeeVpa?: string | null;
    };
  };
  actor: PassTransitionActor;
  note?: string;
  data?: PassTransitionData;
  /**
   * Restricts the move to these current statuses on top of the table's own
   * rules. The sweep passes `SWEEPABLE_PASS_BOOKING_STATUSES`.
   */
  allowedFrom?: readonly PassBookingStatus[];
};

export type PassTransitionFailure =
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'ILLEGAL_STATUS'; from: PassBookingStatus; to: PassBookingStatus }
  | { ok: false; reason: 'NO_PAYMENT' }
  | { ok: false; reason: 'ILLEGAL_PAYMENT_STATUS'; from: PaymentStatus; to: PaymentStatus }
  | { ok: false; reason: 'RACED'; from: PassBookingStatus };

export type PassTransitionResult =
  | { ok: true; passBooking: PassBookingWithRelations }
  | PassTransitionFailure;

/**
 * Target status → the column that records when it happened. `PENDING`,
 * `PENDING_PAYMENT` and `PAYMENT_VERIFICATION`/`PENDING_APPROVAL` are absent
 * on purpose — same reasoning as `STATUS_TIMESTAMP` in the booking version.
 */
const STATUS_TIMESTAMP = {
  CONFIRMED: 'confirmedAt',
  REJECTED: 'rejectedAt',
  CANCELLED: 'cancelledAt',
} as const satisfies Partial<Record<PassBookingStatus, keyof Prisma.PassBookingUncheckedUpdateManyInput>>;

/** Statuses that mean an admin made a decision, so `reviewedBy*` is stamped. */
const REVIEWED_STATUSES: readonly PassBookingStatus[] = ['CONFIRMED', 'REJECTED'];

/**
 * Applies one transition. Read → check → conditional write → audit, all
 * inside a transaction — see `transitionBooking`'s header for why.
 */
export async function transitionPassBooking(
  request: PassTransitionRequest,
): Promise<PassTransitionResult> {
  const { passBookingId, to, actor, note, data, payment, allowedFrom } = request;

  return prisma.$transaction(async (tx) => {
    const current = await tx.passBooking.findUnique({
      where: { id: passBookingId },
      select: {
        id: true,
        status: true,
        payment: { select: { id: true, status: true } },
      },
    });

    if (!current) return { ok: false, reason: 'NOT_FOUND' } as const;

    const from = current.status;

    if (!canTransitionPassBooking(from, to) || (allowedFrom && !allowedFrom.includes(from))) {
      return { ok: false, reason: 'ILLEGAL_STATUS', from, to } as const;
    }

    let paymentFrom: PaymentStatus | null = null;
    let creatingPayment = false;
    if (payment) {
      if (current.payment) {
        paymentFrom = current.payment.status;
        if (paymentFrom !== payment.to && !canTransitionPayment(paymentFrom, payment.to)) {
          return {
            ok: false,
            reason: 'ILLEGAL_PAYMENT_STATUS',
            from: paymentFrom,
            to: payment.to,
          } as const;
        }
      } else if (payment.create) {
        creatingPayment = true;
      } else {
        return { ok: false, reason: 'NO_PAYMENT' } as const;
      }
    }

    const now = new Date();

    const passData: Prisma.PassBookingUncheckedUpdateManyInput = {
      status: to,
      // D5 point 9 — the hold belongs to the customer's part of the flow; see
      // `PassBooking.expiresAt`'s schema comment.
      ...(isSweepablePassBookingStatus(to) ? {} : { expiresAt: null }),
      ...(data?.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
      ...(data?.specification ? { specification: data.specification } : {}),
      ...(data?.entrySide ? { entrySide: data.entrySide } : {}),
    };

    const timestampColumn = STATUS_TIMESTAMP[to as keyof typeof STATUS_TIMESTAMP];
    if (timestampColumn) {
      Object.assign(passData, { [timestampColumn]: now });
    }

    if (REVIEWED_STATUSES.includes(to)) {
      passData.reviewedAt = now;
      passData.reviewedById = actor?.userId ?? null;
      passData.reviewNote = data?.reviewNote ?? note ?? null;
    } else if (data?.reviewNote !== undefined) {
      passData.reviewNote = data.reviewNote;
    }

    const updated = await tx.passBooking.updateMany({
      where: { id: passBookingId, status: from },
      data: passData,
    });

    if (updated.count === 0) return { ok: false, reason: 'RACED', from } as const;

    if (payment && creatingPayment && payment.create) {
      await tx.passPayment.create({
        data: {
          passBookingId,
          method: payment.create.method,
          status: payment.to,
          amountInPaise: payment.create.amountInPaise,
          upiPayeeVpa: payment.create.upiPayeeVpa ?? null,
          ...(payment.upiUtr ? { upiUtr: payment.upiUtr, utrSubmittedAt: now } : {}),
          ...(payment.utrScreenshotUrl ? { utrScreenshotUrl: payment.utrScreenshotUrl } : {}),
          ...(payment.to === 'PAID' ? { paidAt: payment.paidAt ?? now } : {}),
        },
      });
    } else if (payment && current.payment && paymentFrom !== null) {
      await tx.passPayment.update({
        where: { id: current.payment.id },
        data: {
          status: payment.to,
          // A method switch (UPI ↔ cash, see `PASS_BOOKING_TRANSITIONS`)
          // reuses `payment.create`'s fields on an existing row instead of
          // creating a new one — there's no payment to preserve yet.
          ...(payment.create
            ? { method: payment.create.method, upiPayeeVpa: payment.create.upiPayeeVpa ?? null }
            : {}),
          ...(payment.upiUtr ? { upiUtr: payment.upiUtr, utrSubmittedAt: now } : {}),
          ...(payment.utrScreenshotUrl ? { utrScreenshotUrl: payment.utrScreenshotUrl } : {}),
          ...(payment.to === 'PAID' ? { paidAt: payment.paidAt ?? now } : {}),
          ...(payment.to === 'REFUNDED' ? { refundedAt: now } : {}),
          ...(payment.recordVerifier
            ? { verifiedById: actor?.userId ?? null, verifiedAt: now }
            : {}),
          ...(note !== undefined ? { reviewNote: note } : {}),
        },
      });
    }

    await tx.passStatusEvent.create({
      data: {
        passBookingId,
        fromStatus: from,
        toStatus: to,
        // NULL actor is the system, i.e. the expiry sweep.
        actorId: actor?.userId ?? null,
        actorRole: actor?.role ?? null,
        note: note ?? null,
      },
    });

    const passBooking = await tx.passBooking.findUniqueOrThrow({
      where: { id: passBookingId },
      include: PASS_RELATIONS,
    });

    return { ok: true, passBooking } as const;
  });
}

/** The message for a failed transition, written to be read by a customer. */
export function passTransitionFailureMessage(failure: PassTransitionFailure): string {
  switch (failure.reason) {
    case 'NOT_FOUND':
      return 'That pass application could not be found.';
    case 'RACED':
      return 'This application was just updated. Refresh and try again.';
    case 'NO_PAYMENT':
      return 'No payment has been started for this application yet.';
    case 'ILLEGAL_PAYMENT_STATUS':
      return 'That payment update is not possible for this application any more.';
    case 'ILLEGAL_STATUS':
      return 'That is no longer possible for this application.';
  }
}
