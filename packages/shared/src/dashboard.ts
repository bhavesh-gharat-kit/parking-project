/**
 * Admin dashboard and reports contracts (context.txt §20, §26, §27, Phase 10).
 *
 * Both endpoints answer per location — an array, never a single flat object —
 * so the query shape does not bake in "there is exactly one branch" (§23):
 * today there is one `ParkingLocation` row and the array has one entry, and
 * adding a second branch changes nothing here or in the route handlers, only
 * the number of entries (D2, and the schema's own `@@index([locationId, ...])`
 * notes).
 */
import { z } from 'zod';

import { PaymentMethodSchema, VehicleTypeSchema } from './enums';

const IsoDateStampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

/* ═══════════════════════════ Dashboard (§20) ═══════════════════════════ */

/**
 * One location's slice of `GET /api/admin/dashboard`.
 *
 * `pendingUpiVerificationCount`/`pendingCashApprovalCount` are exactly
 * `Booking.status === 'PAYMENT_VERIFICATION'`/`'PENDING_APPROVAL'` counts — the
 * two admin queues §12 asks to be told apart — and are queue depths, not
 * scoped to today: a UTR submitted yesterday and still unverified still
 * belongs on the dashboard. `todayBookingsCount`, `confirmedBookingsCount` and
 * `todayRevenueInPaise` are scoped to the IST calendar day the request runs on.
 */
export const AdminDashboardLocationSchema = z.object({
  locationId: z.string(),
  locationName: z.string(),
  todayBookingsCount: z.number().int(),
  pendingUpiVerificationCount: z.number().int(),
  pendingCashApprovalCount: z.number().int(),
  confirmedBookingsCount: z.number().int(),
  todayRevenueInPaise: z.number().int(),
});
export type AdminDashboardLocation = z.infer<typeof AdminDashboardLocationSchema>;

export const AdminDashboardSummarySchema = z.object({
  /** The IST calendar day these numbers are scoped to, e.g. "2026-09-28". */
  date: z.string(),
  locations: z.array(AdminDashboardLocationSchema),
});
export type AdminDashboardSummary = z.infer<typeof AdminDashboardSummarySchema>;

/* ═══════════════════════════ Reports (§26, §27) ═══════════════════════════ */

/** `GET /api/admin/reports?dateFrom=...&dateTo=...`. Both bound `Booking.startTime`. */
export const AdminReportQuerySchema = z.object({
  dateFrom: IsoDateStampSchema.optional(),
  dateTo: IsoDateStampSchema.optional(),
});
export type AdminReportQuery = z.infer<typeof AdminReportQuerySchema>;

/** Exhaustive by construction: every method/vehicle type is present, 0 if unused. */
export const AdminReportRevenueByMethodSchema = z.record(PaymentMethodSchema, z.number().int());
export type AdminReportRevenueByMethod = z.infer<typeof AdminReportRevenueByMethodSchema>;

export const AdminReportRevenueByVehicleTypeSchema = z.record(
  VehicleTypeSchema,
  z.number().int(),
);
export type AdminReportRevenueByVehicleType = z.infer<
  typeof AdminReportRevenueByVehicleTypeSchema
>;

/**
 * One location's slice of `GET /api/admin/reports`.
 *
 * Booking counts (`totalBookings`...`cancelledBookings`) are scoped to
 * `Booking.startTime` inside `[dateFrom, dateTo]` — the same field the admin
 * booking queue's own date filter bounds (§21). Revenue fields are instead
 * scoped to `Payment.paidAt`, per the schema's own note: a booking paid the
 * next morning belongs to the day it was paid, not the day it was created
 * (§27). Only `Payment.status === 'PAID'` counts as revenue
 * (`REVENUE_PAYMENT_STATUSES`) — a pending or rejected booking never inflates
 * these numbers.
 */
export const AdminReportLocationSchema = z.object({
  locationId: z.string(),
  locationName: z.string(),
  totalBookings: z.number().int(),
  confirmedBookings: z.number().int(),
  rejectedBookings: z.number().int(),
  cancelledBookings: z.number().int(),
  totalRevenueInPaise: z.number().int(),
  revenueByMethod: AdminReportRevenueByMethodSchema,
  revenueByVehicleType: AdminReportRevenueByVehicleTypeSchema,
});
export type AdminReportLocation = z.infer<typeof AdminReportLocationSchema>;

export const AdminReportSchema = z.object({
  range: z.object({ dateFrom: z.string().nullable(), dateTo: z.string().nullable() }),
  locations: z.array(AdminReportLocationSchema),
});
export type AdminReport = z.infer<typeof AdminReportSchema>;
