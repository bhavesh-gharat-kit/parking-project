/**
 * Admin-only request/response contracts (context.txt §19-22, Phase 07).
 *
 * Two areas: the booking approval queue (verify a UPI UTR or take cash, then
 * approve/reject — the admin side of the state machine in `bookings.ts`) and
 * user management (search, view, disable). Nothing here is reachable by a
 * customer-facing route; every handler that consumes these schemas starts with
 * `requireRole(req, 'ADMIN')`.
 */
import { z } from 'zod';

import { PaginationQuerySchema } from './api';
import { BookingSchema } from './bookings';
import { BookingStatusSchema, PaymentMethodSchema, UserRoleSchema, VehicleTypeSchema } from './enums';
import {
  PassBookingSchema,
  PassBookingStatusSchema,
  PassDurationUnitSchema,
  PassEntrySideSchema,
  PassHolidayOffDaySchema,
  PassMobileNumberSchema,
  PassOccupationCategorySchema,
  PassSpecificationSchema,
  PassVehicleCategorySchema,
  PassVehicleNumberSchema,
  ShiftTypeSchema,
} from './passes';
import { CuidSchema } from './schemas';

/* ═══════════════════════════ Booking queue (§21) ═══════════════════════════ */

const IsoDateStampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

/**
 * `GET /api/admin/bookings?...`.
 *
 * `status` alone already answers §12/§13's "UPI pending verification" vs "cash
 * pending approval" distinction — those are exactly `PAYMENT_VERIFICATION` and
 * `PENDING_APPROVAL` — `paymentMethod` narrows further when both filters are
 * combined. `dateFrom`/`dateTo` bound `Booking.startTime` (the parking day an
 * admin actually cares about, not when the booking record was created).
 * `userId` lets the admin's user-detail screen reuse this same endpoint for
 * "this customer's booking history" instead of a second list endpoint.
 */
export const AdminBookingListQuerySchema = PaginationQuerySchema.extend({
  status: BookingStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  dateFrom: IsoDateStampSchema.optional(),
  dateTo: IsoDateStampSchema.optional(),
  /** Matches against booking number, vehicle number, or the customer's name/email. */
  search: z.string().trim().min(1).max(100).optional(),
  userId: CuidSchema.optional(),
});
export type AdminBookingListQuery = z.infer<typeof AdminBookingListQuerySchema>;

export const AdminBookingCustomerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
});
export type AdminBookingCustomer = z.infer<typeof AdminBookingCustomerSchema>;

/** A booking as the admin queue/detail screens see it — everything `Booking`
 *  has, plus who it belongs to (§21's "customer name" search and display). */
export const AdminBookingSchema = BookingSchema.extend({
  customer: AdminBookingCustomerSchema,
});
export type AdminBooking = z.infer<typeof AdminBookingSchema>;

/** `POST /api/admin/bookings/:id/approve` (§11, §12). */
export const AdminBookingApproveRequestSchema = z.object({
  note: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
});
export type AdminBookingApproveRequest = z.input<typeof AdminBookingApproveRequestSchema>;

/**
 * `POST /api/admin/bookings/:id/reject`. `reason` is optional to collect, but
 * when given it lands on `Booking.reviewNote`, which the customer's own booking
 * summary already shows (§21's "visible to the customer").
 */
export const AdminBookingRejectRequestSchema = z.object({
  reason: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
});
export type AdminBookingRejectRequest = z.input<typeof AdminBookingRejectRequestSchema>;

/* ═══════════════════════════ User management (§22) ═════════════════════════ */

export const AdminUserListQuerySchema = PaginationQuerySchema.extend({
  /** Matches against name, email, or phone. */
  search: z.string().trim().min(1).max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;

export const SIGN_IN_METHODS = ['PASSWORD', 'GOOGLE'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];
export const SignInMethodSchema = z.enum(SIGN_IN_METHODS);

/** What the admin user list/detail screens see. Never the password hash. */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  imageUrl: z.string().nullable(),
  role: UserRoleSchema,
  /** §22 — the disable flag. `false` blocks sign-in without deleting anything. */
  isActive: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  signInMethods: z.array(SignInMethodSchema),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/**
 * `PATCH /api/admin/users/:id`. The only field an admin may change here — no
 * password or role management, per §22 ("admin should not need to manually
 * manage user passwords"), and role changes are not part of the Thursday scope.
 */
export const AdminUserSetActiveRequestSchema = z.object({
  isActive: z.boolean(),
});
export type AdminUserSetActiveRequest = z.input<typeof AdminUserSetActiveRequestSchema>;

/* ═══════════════════════════ Pass queue (Phase 21) ══════════════════════════
 *
 * The admin side of the pass-application state machine (`_/decisions.md` D5,
 * `apps/api/lib/passes/transitions.ts`) — the same review/approve/reject shape
 * as the booking queue above — plus the universal field-edit surface (D5
 * point 8): once reviewed, an admin can edit ANY field on a `PassBooking`,
 * `specification`/`entrySide` and `startDate`/`endDate` included, as a plain
 * manual override. Every edit and every status transition lands on
 * `PassStatusEvent`, which this section's schemas also shape for display.
 */

/**
 * `GET /api/admin/passes?...`. `locationId` stands in for the booking query's
 * `dateFrom`/`dateTo`: a pass has no "parking day" to range-filter by, but
 * Phase 21 explicitly asks for a location filter here instead.
 */
export const AdminPassListQuerySchema = PaginationQuerySchema.extend({
  status: PassBookingStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  locationId: CuidSchema.optional(),
  /** Matches against pass number, vehicle number, or the customer's name/email. */
  search: z.string().trim().min(1).max(100).optional(),
  userId: CuidSchema.optional(),
});
export type AdminPassListQuery = z.infer<typeof AdminPassListQuerySchema>;

/**
 * One `PassStatusEvent` row as the detail screen's timeline renders it — a
 * status transition when `toStatus` is set, a plain field edit (D5 point 8)
 * when both `fromStatus`/`toStatus` are `null`, in which case `changedFields`
 * carries the before/after diff instead.
 */
export const AdminPassStatusEventSchema = z.object({
  id: z.string(),
  fromStatus: PassBookingStatusSchema.nullable(),
  toStatus: PassBookingStatusSchema.nullable(),
  actor: AdminBookingCustomerSchema.pick({ id: true, name: true, email: true }).nullable(),
  actorRole: UserRoleSchema.nullable(),
  note: z.string().nullable(),
  changedFields: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })).nullable(),
  createdAt: z.string(),
});
export type AdminPassStatusEvent = z.infer<typeof AdminPassStatusEventSchema>;

/**
 * A pass application as the admin queue/detail screens see it — everything
 * `PassBooking` has, plus who it belongs to (search/display, same reasoning
 * as `AdminBookingSchema`) and its full edit/status history so the detail
 * screen can answer "who changed what, and why" without a separate query
 * (D5 point 8).
 */
export const AdminPassSchema = PassBookingSchema.extend({
  customer: AdminBookingCustomerSchema,
  statusEvents: z.array(AdminPassStatusEventSchema),
});
export type AdminPass = z.infer<typeof AdminPassSchema>;

/**
 * `POST /api/admin/passes/:id/approve`. `specification`/`entrySide` are
 * optional here (D5 point 6, deliverable 2) — an admin may set either now or
 * leave it for a later `PATCH /api/admin/passes/:id`.
 */
export const AdminPassApproveRequestSchema = z.object({
  note: z.string().trim().max(280, 'Keep it under 280 characters').optional(),
  specification: PassSpecificationSchema.optional(),
  entrySide: PassEntrySideSchema.optional(),
});
export type AdminPassApproveRequest = z.input<typeof AdminPassApproveRequestSchema>;

/**
 * `POST /api/admin/passes/:id/reject`. Unlike the daily-booking reject
 * (`reason` optional), a pass rejection requires one (deliverable 2) — it
 * lands on `PassBooking.reviewNote`, the same field the customer's pass
 * summary already shows.
 */
export const AdminPassRejectRequestSchema = z.object({
  reviewNote: z
    .string()
    .trim()
    .min(1, 'Enter a reason for the customer')
    .max(280, 'Keep it under 280 characters'),
});
export type AdminPassRejectRequest = z.input<typeof AdminPassRejectRequestSchema>;

/**
 * Empty string and explicit `null` both mean "clear this field" for a
 * nullable informational column — the edit form always resends the field it
 * is showing, so this has to accept a deliberate clear, unlike the create
 * schema's `optionalTextSchema` which only ever sees "omitted".
 */
function nullableTextSchema(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `Keep it under ${max} characters`).nullable(),
  );
}

/** Same "empty string clears it" convention as `nullableTextSchema`, for the
 *  two nullable enum columns the edit form can clear back to "not set". */
const NullablePassOccupationCategorySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  PassOccupationCategorySchema.nullable(),
);
const NullablePassHolidayOffDaySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  PassHolidayOffDaySchema.nullable(),
);

/** `"HH:MM"`, 24-hour, nullable — same clear-on-empty-string convention. */
const NullableTimeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time as HH:MM')
    .nullable(),
);

/**
 * `PATCH /api/admin/passes/:id` (D5 point 8, deliverable 4) — the ONE surface
 * for editing a `PassBooking`. Every field the customer could have mis-typed,
 * both admin-only fields, the plan snapshot, and the validity window itself,
 * in one schema — not a separate "customer field" endpoint and a separate
 * "admin field" endpoint. Deliberately excludes `status`/`paymentMethod`
 * (reserved for the approve/reject/payment-method endpoints, which carry
 * money-side consequences a plain field write here never should) and every
 * system-managed column (`passNumber`, `userId`, `locationId`, `passPlanId`,
 * timestamps).
 *
 * `startDate`/`endDate` take a plain `YYYY-MM-DD` stamp, the same convention
 * `AdminPassListQuerySchema`'s booking-query cousin uses for date filters —
 * `apps/api/app/api/admin/passes/[id]/route.ts` expands it to an exact IST
 * instant via `istDayBounds`, matching how `computePassValidity` built these
 * columns originally. No recomputation of anything else when they change
 * (D5 point 8): this is a manual override, not a re-run of the validity
 * calculation.
 */
export const AdminPassEditRequestSchema = z
  .object({
    vehicleNumber: PassVehicleNumberSchema.optional(),
    vehicleType: VehicleTypeSchema.optional(),
    vehicleCategory: PassVehicleCategorySchema.optional(),
    vehicleCategoryOther: nullableTextSchema(60).optional(),
    mobileNumber: PassMobileNumberSchema.optional(),
    address: z
      .string()
      .trim()
      .min(1, 'Enter an address')
      .max(500, 'Keep it under 500 characters')
      .optional(),
    occupationCategory: NullablePassOccupationCategorySchema.optional(),
    occupationOther: nullableTextSchema(60).optional(),
    holidayOffDay: NullablePassHolidayOffDaySchema.optional(),
    holidayOffDayOther: nullableTextSchema(20).optional(),
    helmet: z.boolean().optional(),
    locker: z.boolean().optional(),
    airCheck: z.boolean().optional(),
    rickshawParking: z.boolean().optional(),
    renewalReference: nullableTextSchema(120).optional(),
    expectedParkingDays: z.preprocess(
      (value) => (value === '' ? null : value),
      z.coerce.number().int().min(1).max(31).nullable(),
    ).optional(),
    entryTime: NullableTimeSchema.optional(),
    exitTime: NullableTimeSchema.optional(),
    specification: PassSpecificationSchema.nullable().optional(),
    entrySide: PassEntrySideSchema.nullable().optional(),
    planLabel: z.string().trim().min(1, 'Enter a label').max(40, 'Keep it under 40 characters').optional(),
    shiftType: ShiftTypeSchema.optional(),
    durationUnit: PassDurationUnitSchema.optional(),
    durationValue: z.coerce.number().int('Whole numbers only').positive('Must be at least 1').optional(),
    amountInPaise: z.coerce
      .number()
      .int('Whole paise only')
      .positive('Amount must be greater than ₹0')
      .max(10_000_000, 'Keep the amount under ₹1,00,000')
      .optional(),
    startDate: IsoDateStampSchema.optional(),
    endDate: IsoDateStampSchema.optional(),
    note: z
      .string()
      .trim()
      .min(1, 'Add a short note explaining this edit')
      .max(280, 'Keep it under 280 characters'),
  })
  .refine(
    (value) =>
      Object.entries(value).some(([key, fieldValue]) => key !== 'note' && fieldValue !== undefined),
    'Change at least one field.',
  );
export type AdminPassEditRequest = z.input<typeof AdminPassEditRequestSchema>;
export type AdminPassEditRequestParsed = z.output<typeof AdminPassEditRequestSchema>;
