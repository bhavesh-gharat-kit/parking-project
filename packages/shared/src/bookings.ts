/**
 * The booking state machine, and the booking request/response contracts
 * (context.txt §9, §14, §15, §16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHY THE TABLES LIVE HERE AND NOT IN THE API
 * ─────────────────────────────────────────────────────────────────────────────
 * Phases 06 (payments), 07 (admin approval) and 08 (receipts) all move bookings
 * between states, and the Phase 2 website will move them too. One declarative
 * table that every caller checks against beats three handlers each deciding for
 * themselves what "pending" may become next. Nothing here imports Prisma or any
 * Node built-in, so the RN app, the API and a future web admin read the same
 * rules.
 *
 * The API applies these transitions in `apps/api/lib/bookings/transitions.ts`,
 * which is the only place that writes `Booking.status` — it checks the table
 * below, stamps the matching timestamp column and appends a
 * `BookingStatusEvent` in one transaction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE LIFECYCLE (context.txt §9-§15)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   POST /api/bookings (Phase 05)
 *          │
 *          ▼
 *      ┌───────┐  picks UPI (06)   ┌─────────────────┐  submits UTR (06)
 *      │PENDING├──────────────────►│ PENDING_PAYMENT ├───────────────────┐
 *      └──┬─┬──┘                   └────────┬────────┘                   │
 *         │ │                               │                           ▼
 *         │ │ picks CASH (06)               │ 10 min      ┌──────────────────────┐
 *         │ │                               │             │ PAYMENT_VERIFICATION │
 *         │ ▼                               ▼             └───────────┬──────────┘
 *         │ ┌──────────────────┐        (sweep)                       │
 *         │ │ PENDING_APPROVAL │                      admin verifies the UTR (07)
 *         │ └────────┬─────────┘                                      │
 *         │          │ admin takes the cash (07)                       │
 *         │          ▼                                                 ▼
 *         │     ┌───────────┐ ◄───────────────────────────────── (approve)
 *         │     │ CONFIRMED │  receipt available (§17, Phase 08)
 *         │     └─────┬─────┘
 *         │           ▼
 *         │      ┌───────────┐
 *         │      │ COMPLETED │  parking period finished
 *         │      └───────────┘
 *         │
 *         ▼
 *   CANCELLED (customer withdrew) · EXPIRED (sweep, §15) · REJECTED (admin, 07)
 *
 * Two properties this table is built to guarantee, both from context.txt §32:
 *
 *  1. `CONFIRMED` is reachable ONLY from `PAYMENT_VERIFICATION` or
 *     `PENDING_APPROVAL` — i.e. only through an admin decision. No customer
 *     action, and no amount of UTR typing, can confirm a booking: "UTR entered
 *     by a customer is not automatic proof of payment".
 *  2. `BookingStatus` and `PaymentStatus` have separate tables below and are
 *     never derived from one another. They answer different questions ("can
 *     this vehicle park?" vs "did the money arrive?") and a UPI booking is
 *     routinely mid-flight on one axis while settled on the other.
 */
import { z } from 'zod';

import {
  BookingStatusSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  TERMINAL_BOOKING_STATUSES,
  VehicleTypeSchema,
  type BookingStatus,
  type PaymentStatus,
} from './enums';
import { CuidSchema, OptionalUpiUtrSchema } from './schemas';

/* ═══════════════════════════ Booking transitions ═══════════════════════════ */

/**
 * Every legal `BookingStatus` move. A status whose entry is empty is terminal
 * (see `TERMINAL_BOOKING_STATUSES` in `enums.ts`, which this table agrees with
 * by construction — `TransitionTablesAgree` below is the compile-time check that
 * the two cannot drift).
 *
 * Deliberate omissions, each of which a future phase might be tempted to add:
 *
 *  - `PAYMENT_VERIFICATION → CANCELLED`. Once a customer has submitted a UTR
 *    the money may genuinely be in the business's account, so withdrawing the
 *    booking is a refund decision for an admin (`REJECTED`, or `CONFIRMED` then
 *    `CANCELLED` with a `REFUNDED` payment), not a self-service cancel.
 *  - `PAYMENT_VERIFICATION → EXPIRED` and `PENDING_APPROVAL → EXPIRED`. The
 *    §15 sweep exists to release bookings the *customer* abandoned. In both of
 *    these the customer has done their part and is waiting on an admin;
 *    expiring them would punish a customer for admin latency and could discard
 *    a booking that was paid for. See `SWEEPABLE_BOOKING_STATUSES`.
 *  - `REJECTED → anything`. An admin who rejected by mistake creates a new
 *    booking; silently reviving a rejected one would leave the audit trail
 *    (§21) claiming a rejection that no longer holds.
 */
export const BOOKING_TRANSITIONS = {
  /** Created. Phase 06 routes it by payment method. */
  PENDING: ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CANCELLED', 'EXPIRED'],
  /** UPI chosen, QR shown (§11). */
  PENDING_PAYMENT: ['PAYMENT_VERIFICATION', 'CANCELLED', 'EXPIRED'],
  /** UTR submitted; only an admin moves it from here (§32). */
  PAYMENT_VERIFICATION: ['CONFIRMED', 'REJECTED'],
  /** Cash chosen, waiting at the gate (§12). */
  PENDING_APPROVAL: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  /** Approved. `CANCELLED` from here is an admin reversal and implies a refund. */
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  COMPLETED: [],
} as const satisfies Record<BookingStatus, readonly BookingStatus[]>;

/** Every legal `PaymentStatus` move (§14) — a separate axis, see the header. */
export const PAYMENT_TRANSITIONS = {
  /** Cash not yet handed over, or UPI QR shown and no UTR yet. */
  PENDING: ['VERIFICATION_PENDING', 'PAID', 'FAILED', 'REJECTED'],
  /** A UTR is on file. An admin decides; nothing else may (§32). */
  VERIFICATION_PENDING: ['PAID', 'REJECTED'],
  /** The only status that counts as revenue (§27). */
  PAID: ['REFUNDED'],
  FAILED: [],
  REJECTED: [],
  REFUNDED: [],
} as const satisfies Record<PaymentStatus, readonly PaymentStatus[]>;

/* ── Compile-time agreement with `enums.ts` ──────────────────────────────────
 *
 * `TERMINAL_BOOKING_STATUSES` in `enums.ts` and the empty rows of the table
 * above are two statements of one fact, and a new status added to one but not
 * the other is exactly the kind of drift that shows up later as a booking stuck
 * in a state nothing can move it out of. These aliases make that a type error
 * at build time instead. Types only — no runtime cost.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Statuses the table above gives no outgoing move. */
type TerminalByTable = {
  [K in BookingStatus]: (typeof BOOKING_TRANSITIONS)[K]['length'] extends 0 ? K : never;
}[BookingStatus];

/** Errors with "Type 'false' does not satisfy the constraint 'true'" on drift. */
export type TransitionTablesAgree = Equals<
  TerminalByTable,
  (typeof TERMINAL_BOOKING_STATUSES)[number]
> extends true
  ? true
  : never;

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return (BOOKING_TRANSITIONS[from] as readonly BookingStatus[]).includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return (PAYMENT_TRANSITIONS[from] as readonly PaymentStatus[]).includes(to);
}

/** Every status a booking could legally arrive at `to` from. Used by the guarded
 *  conditional updates in the API: the sweep and a Phase 06 handler can race on
 *  the same row, and `WHERE status IN (...)` is what makes the loser a no-op
 *  rather than an illegal overwrite. */
export function bookingStatusesLeadingTo(to: BookingStatus): BookingStatus[] {
  return (Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]).filter((from) =>
    canTransitionBooking(from, to),
  );
}

/**
 * context.txt §15 — the statuses the expiry sweep is allowed to touch: exactly
 * those where the system is waiting on the *customer*. See the omission notes
 * on `BOOKING_TRANSITIONS`.
 */
export const SWEEPABLE_BOOKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
] as const satisfies readonly BookingStatus[];

export type SweepableBookingStatus = (typeof SWEEPABLE_BOOKING_STATUSES)[number];

export function isSweepableBookingStatus(status: BookingStatus): boolean {
  return (SWEEPABLE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/**
 * What a *customer* may cancel themselves. Everything else that ends in
 * `CANCELLED` (a confirmed booking being reversed) is an admin action, so the
 * app can hide the button instead of offering one the API will refuse.
 */
export const CUSTOMER_CANCELLABLE_BOOKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
] as const satisfies readonly BookingStatus[];

export function isCustomerCancellable(status: BookingStatus): boolean {
  return (CUSTOMER_CANCELLABLE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/**
 * Statuses where the booking is still working its way through the flow — what
 * the customer's "current bookings" list shows (§16) and what the admin queue
 * counts (§20).
 */
export const OPEN_BOOKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PAYMENT_VERIFICATION',
  'PENDING_APPROVAL',
  'CONFIRMED',
] as const satisfies readonly BookingStatus[];

/* ═════════════════════════════ Requests ═══════════════════════════════════ */

/**
 * `POST /api/bookings` — context.txt §187-189, §837, §32.
 *
 * THREE IDs AND NOTHING ELSE. No amount, no price, no start or end time, no
 * status: the backend reads `ParkingRate.priceInPaise` and derives
 * `amountInPaise`, `startTime` and `endTime` itself. This schema is the reason a
 * tampered `amountInPaise` in the request body cannot reach the database — Zod
 * strips unknown keys, so the field never exists on the parsed object the
 * handler goes on to use.
 *
 * Note it is NOT `.strict()`: an extra key is dropped silently rather than
 * answered with a 422. A tampering client should get a correctly priced booking
 * (and learn nothing), and an older APK that posts a field a later API no longer
 * reads should keep working rather than breaking at the gate.
 */
export const BookingCreateRequestSchema = z.object({
  locationId: CuidSchema,
  vehicleId: CuidSchema,
  /** Which `ParkingRate` row — the package — the customer picked (§7). */
  rateId: CuidSchema,
});
export type BookingCreateRequest = z.infer<typeof BookingCreateRequestSchema>;

/**
 * `GET /api/bookings?status=…&paymentStatus=…`.
 *
 * Two independent filters over two separate columns on two separate tables —
 * the queryable half of "booking status and payment status are separate
 * concepts" (§32). `paymentStatus` filters on the related `Payment` row, so
 * `?paymentStatus=PAID` cannot match a booking that has no payment yet however
 * far along `status` is.
 */
export const BookingListQuerySchema = z.object({
  status: BookingStatusSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;

/** `POST /api/bookings/:id/cancel`. */
export const BookingCancelRequestSchema = z.object({
  reason: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
});
export type BookingCancelRequest = z.input<typeof BookingCancelRequestSchema>;

/**
 * `POST /api/bookings/:id/payment-method` (context.txt §368-374, Phase 06).
 *
 * `UPI` moves the booking to `PENDING_PAYMENT` and `CASH` to
 * `PENDING_APPROVAL` — the branch is entirely the backend's, from
 * `BOOKING_TRANSITIONS`, so a tampered value here can only ever select a legal
 * status for `PENDING`, never invent one.
 */
export const BookingPaymentMethodRequestSchema = z.object({
  method: PaymentMethodSchema,
});
export type BookingPaymentMethodRequest = z.input<typeof BookingPaymentMethodRequestSchema>;

/**
 * `POST /api/bookings/:id/utr` (context.txt §306-336, Phase 06; Phase 15).
 *
 * Submitting this NEVER marks the payment `PAID` — see the header of
 * `apps/api/lib/bookings/transitions.ts`. It only moves the booking to
 * `PAYMENT_VERIFICATION` so an admin can check it (Phase 07).
 *
 * `utr` is optional here — the payment screenshot is the required evidence
 * (enforced by `apps/api/app/api/bookings/[id]/utr/route.ts`, which this
 * schema has no way to express since the screenshot is a file, not a field
 * on this JSON-shaped object). Typing the UTR is now a bonus that makes the
 * admin's bank-statement check faster, not a requirement.
 */
export const BookingUtrSubmitRequestSchema = z.object({
  utr: OptionalUpiUtrSchema,
});
export type BookingUtrSubmitRequest = z.input<typeof BookingUtrSubmitRequestSchema>;
export type BookingUtrSubmitRequestParsed = z.output<typeof BookingUtrSubmitRequestSchema>;

/* ═════════════════════════════ Responses ══════════════════════════════════ */

/** The branch a booking was made at, denormalised for the summary and receipt. */
export const BookingLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine: z.string(),
  city: z.string(),
  /**
   * §11, Phase 06 — the static QR image for this branch's UPI payment screen.
   * Read live off the location (unlike `Payment.upiPayeeVpa`, this is not
   * snapshotted: it is just an image reference, not something a reconciliation
   * report depends on staying frozen).
   */
  upiQrImageUrl: z.string().nullable(),
});

/**
 * The money side of a booking — `null` until the customer picks a payment
 * method in Phase 06, because `Payment.method` cannot be null and a payment
 * with no method would be a row asserting something untrue.
 *
 * Nested rather than flattened onto the booking precisely because §32 forbids
 * conflating the two: `booking.status` and `booking.payment?.status` cannot be
 * mistaken for one field at a call site.
 */
export const BookingPaymentSchema = z.object({
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  amountInPaise: z.number(),
  /**
   * §11 — the VPA the customer was shown on the payment screen, snapshotted at
   * the moment `UPI` was selected so a later change to the branch's UPI ID does
   * not rewrite what this booking says it asked for. `null` for a `CASH`
   * booking.
   */
  upiPayeeVpa: z.string().nullable(),
  /** §11 — the reference the customer read off their UPI app. A claim, not proof. */
  upiUtr: z.string().nullable(),
  /**
   * §278-336, Phase 15 — a payment-app screenshot the customer attached
   * alongside the UTR. Optional supporting evidence for the admin, same
   * standing as `upiUtr` itself: a claim, not proof (§32).
   */
  utrScreenshotUrl: z.string().nullable(),
  paidAt: z.string().nullable(),
});
export type BookingPayment = z.infer<typeof BookingPaymentSchema>;

/**
 * A booking as the customer's app sees it. Covers every field the booking
 * summary is required to show (context.txt §248-258): location, vehicle,
 * vehicle type, package, start time, end time, amount, payment method, status.
 *
 * The vehicle and package fields are the booking's own SNAPSHOT columns, not a
 * join out to the live `Vehicle`/`ParkingRate` rows — an admin editing a price
 * (§24) must not rewrite what an existing booking says it cost. `vehicleId` and
 * `rateId` ride along for traceability only.
 */
export const BookingSchema = z.object({
  id: z.string(),
  /** §17 — what the customer reads out at the gate, e.g. "KLY-260928-4F2B". */
  bookingNumber: z.string(),

  status: BookingStatusSchema,
  /** `null` until Phase 06's method selection. */
  paymentMethod: PaymentMethodSchema.nullable(),
  payment: BookingPaymentSchema.nullable(),

  location: BookingLocationSchema,

  vehicleId: z.string(),
  vehicleNumber: z.string(),
  vehicleType: VehicleTypeSchema,

  rateId: z.string(),
  /** "2 Hours", "Full Day" — the package as sold (§7). */
  rateLabel: z.string(),
  durationMinutes: z.number(),

  /** Integer paise, fixed at creation by the backend (§32). */
  amountInPaise: z.number(),

  startTime: z.string(),
  endTime: z.string(),

  /** §15 — when the sweep will expire this if the customer does not finish. Null
   *  once the booking is no longer the customer's to complete. */
  expiresAt: z.string().nullable(),

  confirmedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  expiredAt: z.string().nullable(),

  /** §21 — why an admin rejected it, shown to the customer. */
  reviewNote: z.string().nullable(),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Booking = z.infer<typeof BookingSchema>;

/** `POST /api/cron/expire-bookings` (§15) — what one sweep run did. */
export const ExpirySweepResultSchema = z.object({
  /** How many bookings this run moved to `EXPIRED`. */
  expired: z.number(),
  /** Candidates the run found; higher than `expired` if another request won a race. */
  examined: z.number(),
  /** True when the batch cap was hit and another run has more to do. */
  hasMore: z.boolean(),
  /** The cutoff used, i.e. `now`. */
  sweptAt: z.string(),
  /** The effective §15 window, from `AppSetting` or `BOOKING_EXPIRY_MINUTES`. */
  expiryMinutes: z.number(),
});
export type ExpirySweepResult = z.infer<typeof ExpirySweepResultSchema>;
