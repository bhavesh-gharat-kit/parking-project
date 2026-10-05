/**
 * Parking pass module (`_/decisions.md` D5, Phases 19-22).
 *
 * A second, parallel booking type sold alongside the daily `Booking`/
 * `ParkingRate` pair — a monthly/weekly pass rather than a single parking
 * session. This file is the enum/label plumbing for the whole module (so
 * later phases import one thing) plus the `PassPlan` request/response
 * contracts Phase 19's admin screen needs. `PassBooking`/`PassPayment`
 * request contracts are Phase 20's job — nothing here is customer-reachable
 * yet.
 */
import { z } from 'zod';

import { PaymentMethodSchema, PaymentStatusSchema, VehicleTypeSchema } from './enums';
import { rupeesToPaise } from './money';
import { CuidSchema, IndianPhoneSchema } from './schemas';

/* ──────────────────────────── Shift type (D5 point 2) ────────────────── */

export const SHIFT_TYPES = ['DAY', 'NIGHT', 'BOTH'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];
export const ShiftTypeSchema = z.enum(SHIFT_TYPES);

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  DAY: 'Day',
  NIGHT: 'Night',
  BOTH: 'Day & Night',
};

/* ───────────────────── Pass vehicle category (D5 point 4) ────────────── */

/** Cosmetic only — which icon/box gets ticked on the printed pass (Phase 22). */
export const PASS_VEHICLE_CATEGORIES = [
  'BULLET',
  'AVENGER',
  'SCOOTY',
  'SPORTS',
  'CAR',
  'RICKSHAW',
  'OTHER',
] as const;
export type PassVehicleCategory = (typeof PASS_VEHICLE_CATEGORIES)[number];
export const PassVehicleCategorySchema = z.enum(PASS_VEHICLE_CATEGORIES);

export const PASS_VEHICLE_CATEGORY_LABELS: Record<PassVehicleCategory, string> = {
  BULLET: 'Bullet',
  AVENGER: 'Avenger',
  SCOOTY: 'Scooty',
  SPORTS: 'Sports Bike',
  CAR: 'Car',
  RICKSHAW: 'Rickshaw',
  OTHER: 'Other',
};

/* ─────────────────────── Pass duration unit ──────────────────────────── */

/**
 * Which unit `PassPlan.durationValue` counts in. Added after the original
 * "every tier snaps to calendar month" rule (D5 point 3) turned out to make a
 * true weekly/15-day plan impossible for the admin to create — `MONTHS` keeps
 * that behaviour, `DAYS` is a literal day count clipped to month-end (see
 * `apps/api/lib/passes/validity.ts`).
 */
export const PASS_DURATION_UNITS = ['MONTHS', 'DAYS'] as const;
export type PassDurationUnit = (typeof PASS_DURATION_UNITS)[number];
export const PassDurationUnitSchema = z.enum(PASS_DURATION_UNITS);

export const PASS_DURATION_UNIT_LABELS: Record<PassDurationUnit, string> = {
  MONTHS: 'Months',
  DAYS: 'Days',
};

/** "15 Days" / "1 Month" / "3 Months" — the one place this phrase is built,
 *  so the plan list, the plan form, and the review card never disagree. */
export function formatPassDuration(unit: PassDurationUnit, value: number): string {
  if (unit === 'DAYS') return `${value} ${value === 1 ? 'Day' : 'Days'}`;
  return `${value} ${value === 1 ? 'Month' : 'Months'}`;
}

/* ───────────────── Pass occupation category (D5 point 5) ─────────────── */

/** Field 13 व्यवसाय — informational only, never read by pricing/validity/
 *  eligibility logic. `OTHER` pairs with a free-text `occupationOther`. */
export const PASS_OCCUPATION_CATEGORIES = [
  'LAWYER',
  'SERVANT',
  'DEVOTEE',
  'BUSINESSMAN',
  'SENIOR_CITIZEN',
  'OTHER',
] as const;
export type PassOccupationCategory = (typeof PASS_OCCUPATION_CATEGORIES)[number];
export const PassOccupationCategorySchema = z.enum(PASS_OCCUPATION_CATEGORIES);

export const PASS_OCCUPATION_CATEGORY_LABELS: Record<PassOccupationCategory, string> = {
  LAWYER: 'Lawyer',
  SERVANT: 'Servant',
  DEVOTEE: 'Devotee',
  BUSINESSMAN: 'Businessman',
  SENIOR_CITIZEN: 'Senior Citizen',
  OTHER: 'Other',
};

/* ───────────────────── Pass holiday off day (D5 point 5) ─────────────── */

/** Field 8's सुट्टीचे दिवस — same "informational, OTHER pairs with free text" shape. */
export const PASS_HOLIDAY_OFF_DAYS = ['SUNDAY', 'SATURDAY', 'OTHER'] as const;
export type PassHolidayOffDay = (typeof PASS_HOLIDAY_OFF_DAYS)[number];
export const PassHolidayOffDaySchema = z.enum(PASS_HOLIDAY_OFF_DAYS);

export const PASS_HOLIDAY_OFF_DAY_LABELS: Record<PassHolidayOffDay, string> = {
  SUNDAY: 'Sunday',
  SATURDAY: 'Saturday',
  OTHER: 'Other',
};

/* ───────────────────── Pass specification (D5 point 6) ───────────────── */

/** Admin-only classification of the pass holder — never customer-selected. */
export const PASS_SPECIFICATIONS = ['SPECIAL', 'GENERAL', 'ODD'] as const;
export type PassSpecification = (typeof PASS_SPECIFICATIONS)[number];
export const PassSpecificationSchema = z.enum(PASS_SPECIFICATIONS);

export const PASS_SPECIFICATION_LABELS: Record<PassSpecification, string> = {
  SPECIAL: 'Special',
  GENERAL: 'General',
  ODD: 'Odd',
};

/* ─────────────────────── Pass entry side (D5 point 6) ─────────────────── */

/** Admin-only — which side of the lot the pass holder parks in. */
export const PASS_ENTRY_SIDES = ['ST_STAND', 'COURT_SIDE'] as const;
export type PassEntrySide = (typeof PASS_ENTRY_SIDES)[number];
export const PassEntrySideSchema = z.enum(PASS_ENTRY_SIDES);

export const PASS_ENTRY_SIDE_LABELS: Record<PassEntrySide, string> = {
  ST_STAND: 'S.T. Stand Side',
  COURT_SIDE: 'Court Side',
};

/* ───────────────────── Pass booking status (D5 point 3) ──────────────── */

/**
 * Deliberately NO `EXPIRED`/`COMPLETED` value: "active" vs. "expired" is
 * always a read-time comparison of `PassBooking.endDate` against today, never
 * a stored transition (schema.prisma's comment on `PassBookingStatus`).
 */
export const PASS_BOOKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PAYMENT_VERIFICATION',
  'PENDING_APPROVAL',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const;
export type PassBookingStatus = (typeof PASS_BOOKING_STATUSES)[number];
export const PassBookingStatusSchema = z.enum(PASS_BOOKING_STATUSES);

export const PASS_BOOKING_STATUS_LABELS: Record<PassBookingStatus, string> = {
  PENDING: 'Pending',
  PENDING_PAYMENT: 'Awaiting Payment',
  PAYMENT_VERIFICATION: 'Payment Verification',
  PENDING_APPROVAL: 'Pending Approval',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Statuses from which no further transition is possible (Phase 21 owns the transition table itself). */
export const TERMINAL_PASS_BOOKING_STATUSES = [
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly PassBookingStatus[];

export function isTerminalPassBookingStatus(status: PassBookingStatus): boolean {
  return (TERMINAL_PASS_BOOKING_STATUSES as readonly PassBookingStatus[]).includes(status);
}

/* ──────────────────────────── Pass plan (D5 point 2) ──────────────────── */

/**
 * `POST /api/admin/pass-plans`, `PATCH /api/admin/pass-plans/:id` (Phase 19).
 *
 * Same "rupees in, paise out" convention as `ParkingRateRequestSchema` — a
 * parking-lot admin types "500", not "50000".
 */
export const PassPlanRequestSchema = z.object({
  locationId: z.string().min(1, 'Required'),
  vehicleType: VehicleTypeSchema,
  shiftType: ShiftTypeSchema,
  label: z.string().trim().min(1, 'Enter a label').max(40, 'Keep it under 40 characters'),
  durationUnit: PassDurationUnitSchema,
  /** Months: up to 24. Days: up to 31 — a day-based plan never crosses a
   *  month boundary (`computePassValidity`'s clip), so more than a month's
   *  worth of days could never actually be used. */
  durationValue: z.coerce
    .number({ error: 'Enter the duration' })
    .int('Whole numbers only')
    .positive('Duration must be at least 1'),
  /** Input: rupees the admin typed. Output (post-transform): paise. */
  priceInRupees: z.coerce
    .number({ error: 'Enter a price' })
    .positive('Price must be greater than ₹0')
    .max(100000, 'Keep the price under ₹1,00,000')
    .transform((rupees) => rupeesToPaise(rupees)),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).refine(
  (value) => (value.durationUnit === 'MONTHS' ? value.durationValue <= 24 : value.durationValue <= 31),
  { message: 'Months: up to 24. Days: up to 31.', path: ['durationValue'] },
);
export type PassPlanRequest = z.input<typeof PassPlanRequestSchema>;
export type PassPlanRequestParsed = z.output<typeof PassPlanRequestSchema>;

/** What the customer's pass-plan list sees — never `isActive` (already filtered). */
export const PassPlanSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  vehicleType: VehicleTypeSchema,
  shiftType: ShiftTypeSchema,
  label: z.string(),
  durationUnit: PassDurationUnitSchema,
  durationValue: z.number(),
  priceInPaise: z.number(),
  sortOrder: z.number(),
});
export type PassPlan = z.infer<typeof PassPlanSchema>;

/** What the admin pass-plan management screen sees. */
export const AdminPassPlanSchema = PassPlanSchema.extend({
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminPassPlan = z.infer<typeof AdminPassPlanSchema>;

/* ═══════════════════════════ Pass booking transitions ═══════════════════════
 *
 * Mirrors `BOOKING_TRANSITIONS` in `bookings.ts` — same reasoning, same
 * "the API applies these, never decides for itself" split (Phase 20 applies
 * this table in `apps/api/lib/passes/transitions.ts`). Shorter than the
 * booking table because `PassBookingStatus` has no `COMPLETED`/`EXPIRED`
 * value (D5 point 3): an abandoned application is swept into `CANCELLED`
 * (see `SWEEPABLE_PASS_BOOKING_STATUSES` below), and nothing ever marks a
 * pass "completed" — it simply runs past `endDate`.
 */
export const PASS_BOOKING_TRANSITIONS = {
  /** Created. Phase 20 routes it by payment method. */
  PENDING: ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CANCELLED'],
  /** UPI chosen, QR shown. */
  PENDING_PAYMENT: ['PAYMENT_VERIFICATION', 'CANCELLED'],
  /** UTR submitted; only an admin moves it from here (§32 lineage). */
  PAYMENT_VERIFICATION: ['CONFIRMED', 'REJECTED'],
  /** Cash chosen, waiting for the admin. */
  PENDING_APPROVAL: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: [],
  REJECTED: [],
  CANCELLED: [],
} as const satisfies Record<PassBookingStatus, readonly PassBookingStatus[]>;

export function canTransitionPassBooking(from: PassBookingStatus, to: PassBookingStatus): boolean {
  return (PASS_BOOKING_TRANSITIONS[from] as readonly PassBookingStatus[]).includes(to);
}

/**
 * D5 point 9 — the statuses the pass expiry sweep is allowed to touch: exactly
 * those where the system is waiting on the *customer*, mirroring
 * `SWEEPABLE_BOOKING_STATUSES`.
 */
export const SWEEPABLE_PASS_BOOKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
] as const satisfies readonly PassBookingStatus[];

export type SweepablePassBookingStatus = (typeof SWEEPABLE_PASS_BOOKING_STATUSES)[number];

export function isSweepablePassBookingStatus(status: PassBookingStatus): boolean {
  return (SWEEPABLE_PASS_BOOKING_STATUSES as readonly PassBookingStatus[]).includes(status);
}

/* ──────────────────── Free-text application fields (D5 point 1) ──────────── */

/**
 * Pass vehicle number: free text, no account/vehicle linkage (D5 point 1) —
 * normalised the same way as `VehicleNumberSchema` (upper-case, strip spaces/
 * dashes) but its own schema, since `PassBooking.vehicleNumber` is
 * `VARCHAR(10)` — tighter than a daily booking's `VARCHAR(14)` — and is never
 * checked against the `Vehicle` table's own format rules.
 */
export const PassVehicleNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine(
    (value) => /^[A-Z0-9]{1,10}$/.test(value),
    'Enter a valid vehicle number (10 characters or fewer)',
  );

/**
 * D5 point 1 — "exactly 10 digits, Indian format". `IndianPhoneSchema` is
 * already precisely that (strips a `+91`/`0`/`91` prefix, then requires
 * `[6-9]\d{9}`), so this is just the pass module's own name for it — it is
 * never validated against the signed-in user's own `User.phone` (D5 point 1:
 * a profile phone may only pre-fill this field as a convenience).
 */
export const PassMobileNumberSchema = IndianPhoneSchema;

/** Empty string means "not supplied", same convention as `OptionalIndianPhoneSchema`. */
function optionalTextSchema(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max, `Keep it under ${max} characters`).optional(),
  );
}

/* ═════════════════════════════ Pass booking requests ══════════════════════
 *
 * `POST /api/passes` (Phase 20, D5). NO price, NO validity date — same rule as
 * `BookingCreateRequestSchema` (§32 lineage): the backend looks up the live
 * `PassPlan` and derives `amountInPaise`/`startDate`/`endDate` itself
 * (`apps/api/lib/passes/create.ts`). Not `shiftType`, either — that is a
 * property of the `PassPlan` row the customer picked, snapshotted from it,
 * never a second, independently-tamperable input that could disagree with
 * the plan.
 */
/** Empty string, `null` (the chip selector's "nothing picked" state) and
 *  `undefined` all mean "not supplied" — same convention as `optionalTextSchema`. */
const OptionalPassOccupationCategorySchema = z.preprocess(
  (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  PassOccupationCategorySchema.optional(),
);
const OptionalPassHolidayOffDaySchema = z.preprocess(
  (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  PassHolidayOffDaySchema.optional(),
);

/** `"HH:MM"`, 24-hour — field 2's येण्याची वेळ / जाण्याची वेळ. Informational
 *  only; empty string means "not supplied". */
const OptionalTimeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:MM')
    .optional(),
);

export const PassCreateRequestSchema = z.object({
  locationId: CuidSchema,
  passPlanId: CuidSchema,
  vehicleNumber: PassVehicleNumberSchema,
  vehicleType: VehicleTypeSchema,
  vehicleCategory: PassVehicleCategorySchema,
  mobileNumber: PassMobileNumberSchema,
  address: z.string().trim().min(1, 'Enter an address').max(500, 'Keep it under 500 characters'),
  /** D5 point 5 — informational only, never read by pricing/validity/eligibility logic. */
  occupationCategory: OptionalPassOccupationCategorySchema,
  occupationOther: optionalTextSchema(60),
  holidayOffDay: OptionalPassHolidayOffDaySchema,
  holidayOffDayOther: optionalTextSchema(20),
  helmet: z.boolean().default(false),
  locker: z.boolean().default(false),
  airCheck: z.boolean().default(false),
  rickshawParking: z.boolean().default(false),
  renewalReference: optionalTextSchema(120),
  /** Customer-declared, informational only — never enforced. */
  expectedParkingDays: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(1).max(31).optional(),
  ),
  entryTime: OptionalTimeSchema,
  exitTime: OptionalTimeSchema,
});
export type PassCreateRequest = z.input<typeof PassCreateRequestSchema>;
export type PassCreateRequestParsed = z.output<typeof PassCreateRequestSchema>;

/* ═════════════════════════════ Pass responses ═════════════════════════════ */

/** The money side of a pass application — mirrors `BookingPaymentSchema`. */
export const PassPaymentSchema = z.object({
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  amountInPaise: z.number(),
  upiPayeeVpa: z.string().nullable(),
  upiUtr: z.string().nullable(),
  utrScreenshotUrl: z.string().nullable(),
  paidAt: z.string().nullable(),
});
export type PassPayment = z.infer<typeof PassPaymentSchema>;

/** The branch a pass was applied for — mirrors `BookingLocationSchema`. */
export const PassBookingLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine: z.string(),
  city: z.string(),
  upiQrImageUrl: z.string().nullable(),
});

/**
 * A pass application as the customer's app sees it — the snapshot columns
 * (`planLabel`, `vehicleType`, `shiftType`, `validityMonths`,
 * `amountInPaise`) plus the free-text application fields, never a join out to
 * the live `PassPlan` (D5 point 2, same reasoning as `BookingSchema`).
 *
 * `specification`/`entrySide` are included so the detail screen can show them
 * once an admin sets them (Phase 21) — both `null` until then (D5 point 6);
 * nothing in Phase 20 offers an input for either.
 */
export const PassBookingSchema = z.object({
  id: z.string(),
  /** D5 — "KLY-PASS-2610-0007" (branch, YYMM, then a 4-digit counter). */
  passNumber: z.string(),

  status: PassBookingStatusSchema,
  /** `null` until the customer picks UPI or cash. */
  paymentMethod: PaymentMethodSchema.nullable(),
  payment: PassPaymentSchema.nullable(),

  location: PassBookingLocationSchema,

  planLabel: z.string(),
  vehicleType: VehicleTypeSchema,
  shiftType: ShiftTypeSchema,
  durationUnit: PassDurationUnitSchema,
  durationValue: z.number(),
  /** Integer paise, fixed at creation by the backend (§32 lineage). */
  amountInPaise: z.number(),

  vehicleNumber: z.string(),
  vehicleCategory: PassVehicleCategorySchema,
  mobileNumber: z.string(),
  address: z.string(),

  occupationCategory: PassOccupationCategorySchema.nullable(),
  occupationOther: z.string().nullable(),
  holidayOffDay: PassHolidayOffDaySchema.nullable(),
  holidayOffDayOther: z.string().nullable(),
  helmet: z.boolean(),
  locker: z.boolean(),
  airCheck: z.boolean(),
  rickshawParking: z.boolean(),
  renewalReference: z.string().nullable(),
  expectedParkingDays: z.number().nullable(),
  entryTime: z.string().nullable(),
  exitTime: z.string().nullable(),

  /** Admin-only (D5 point 6) — `null` until an admin sets them (Phase 21). */
  specification: PassSpecificationSchema.nullable(),
  entrySide: PassEntrySideSchema.nullable(),

  /** D5 point 3 — computed once at submission, never recomputed. */
  startDate: z.string(),
  endDate: z.string(),

  /** D5 point 9 — when the sweep will cancel this unpaid application. `null`
   *  once it is no longer the customer's to finish. */
  expiresAt: z.string().nullable(),

  confirmedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),

  /** §21 lineage — why an admin rejected it, shown to the customer. */
  reviewNote: z.string().nullable(),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PassBooking = z.infer<typeof PassBookingSchema>;

/**
 * D5 point 3 — "active" vs. "expired" is ALWAYS this read-time comparison
 * against `endDate`, never a stored status. The one place this comparison is
 * written, so the customer's pass list and the admin queue (Phase 21) read it
 * identically.
 */
export function isPassExpired(endDate: string | Date): boolean {
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  return end.getTime() < Date.now();
}

/**
 * `POST /api/cron/expire-passes` (D5 point 9) — what one sweep run did.
 * Mirrors `ExpirySweepResultSchema`, except the outcome is `cancelled` rather
 * than `expired`: `PassBookingStatus` has no `EXPIRED` value, so an abandoned
 * application is swept straight into `CANCELLED` with an audit note
 * explaining why.
 */
export const PassExpirySweepResultSchema = z.object({
  cancelled: z.number(),
  examined: z.number(),
  hasMore: z.boolean(),
  sweptAt: z.string(),
  expiryMinutes: z.number(),
});
export type PassExpirySweepResult = z.infer<typeof PassExpirySweepResultSchema>;
