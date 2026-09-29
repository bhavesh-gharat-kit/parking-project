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
import { BookingStatusSchema, PaymentMethodSchema, UserRoleSchema } from './enums';
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
