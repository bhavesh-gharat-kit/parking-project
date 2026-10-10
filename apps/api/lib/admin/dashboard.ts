/**
 * Dashboard and report aggregation (context.txt §20, §26, §27, Phase 10).
 *
 * Both functions loop over `ParkingLocation` rows and run location-scoped
 * queries per row, rather than one global query — `ParkingLocation` is a live
 * table (§23), so the number of locations here is a query result, not a
 * constant. That costs nothing extra today, with one active branch, and needs
 * no change the day a second one opens (D2).
 *
 * Revenue is read off `Payment.status`/`Payment.paidAt`, never
 * `Booking.status`/`Booking.createdAt`: only `REVENUE_PAYMENT_STATUSES`
 * (`PAID`) counts as revenue (§27), and a booking paid the next morning belongs
 * to the day it was paid, per the schema's own note on `Payment.paidAt`.
 */
import {
  istDayBounds,
  istParts,
  PAYMENT_METHODS,
  REVENUE_PAYMENT_STATUSES,
  VEHICLE_TYPES,
  type AdminDashboardSummary,
  type AdminReport,
  type AdminReportLocation,
  type AdminReportQuery,
} from '@parking/shared';

import { prisma } from '@/lib/db';

function todayIstDateStamp(): string {
  const { year, month, day } = istParts(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function activeLocations() {
  return prisma.parkingLocation.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function buildDashboardSummary(): Promise<AdminDashboardSummary> {
  const date = todayIstDateStamp();
  const { start, end } = istDayBounds(date);
  const locations = await activeLocations();

  const summaries = await Promise.all(
    locations.map(async (location) => {
      const [
        todayBookingsCount,
        pendingUpiVerificationCount,
        pendingCashApprovalCount,
        confirmedBookingsCount,
        revenue,
      ] = await Promise.all([
        prisma.booking.count({
          where: { locationId: location.id, startTime: { gte: start, lte: end } },
        }),
        prisma.booking.count({
          where: { locationId: location.id, status: 'PAYMENT_VERIFICATION' },
        }),
        prisma.booking.count({
          where: { locationId: location.id, status: 'PENDING_APPROVAL' },
        }),
        prisma.booking.count({
          where: {
            locationId: location.id,
            status: 'CONFIRMED',
            startTime: { gte: start, lte: end },
          },
        }),
        prisma.booking.aggregate({
          _sum: { amountInPaise: true },
          where: {
            locationId: location.id,
            payment: {
              status: { in: [...REVENUE_PAYMENT_STATUSES] },
              paidAt: { gte: start, lte: end },
            },
          },
        }),
      ]);

      return {
        locationId: location.id,
        locationName: location.name,
        todayBookingsCount,
        pendingUpiVerificationCount,
        pendingCashApprovalCount,
        confirmedBookingsCount,
        todayRevenueInPaise: revenue._sum?.amountInPaise ?? 0,
      };
    }),
  );

  return { date, locations: summaries };
}

export async function buildReport(query: AdminReportQuery): Promise<AdminReport> {
  const rangeStart = query.dateFrom ? istDayBounds(query.dateFrom).start : undefined;
  const rangeEnd = query.dateTo ? istDayBounds(query.dateTo).end : undefined;

  const startTimeWhere = {
    ...(rangeStart ? { gte: rangeStart } : {}),
    ...(rangeEnd ? { lte: rangeEnd } : {}),
  };
  const hasStartTimeWhere = Object.keys(startTimeWhere).length > 0;

  // §27 — revenue dates off `Payment.paidAt`, the same range applied to the
  // opposite field.
  const paidWhere = {
    status: { in: [...REVENUE_PAYMENT_STATUSES] },
    ...(hasStartTimeWhere ? { paidAt: startTimeWhere } : {}),
  };

  const locations = await activeLocations();

  const summaries = await Promise.all(
    locations.map(async (location): Promise<AdminReportLocation> => {
      const [totalBookings, confirmedBookings, rejectedBookings, cancelledBookings, byMethod, byVehicleType] =
        await Promise.all([
          prisma.booking.count({
            where: { locationId: location.id, ...(hasStartTimeWhere ? { startTime: startTimeWhere } : {}) },
          }),
          prisma.booking.count({
            where: {
              locationId: location.id,
              status: 'CONFIRMED',
              ...(hasStartTimeWhere ? { startTime: startTimeWhere } : {}),
            },
          }),
          prisma.booking.count({
            where: {
              locationId: location.id,
              status: 'REJECTED',
              ...(hasStartTimeWhere ? { startTime: startTimeWhere } : {}),
            },
          }),
          prisma.booking.count({
            where: {
              locationId: location.id,
              status: 'CANCELLED',
              ...(hasStartTimeWhere ? { startTime: startTimeWhere } : {}),
            },
          }),
          prisma.booking.groupBy({
            by: ['paymentMethod'],
            where: { locationId: location.id, payment: paidWhere },
            _sum: { amountInPaise: true },
          }),
          prisma.booking.groupBy({
            by: ['vehicleType'],
            where: { locationId: location.id, payment: paidWhere },
            _sum: { amountInPaise: true },
          }),
        ]);

      const revenueByMethod = Object.fromEntries(
        PAYMENT_METHODS.map((method) => [
          method,
          byMethod.find((row) => row.paymentMethod === method)?._sum?.amountInPaise ?? 0,
        ]),
      ) as AdminReportLocation['revenueByMethod'];

      const revenueByVehicleType = Object.fromEntries(
        VEHICLE_TYPES.map((vehicleType) => [
          vehicleType,
          byVehicleType.find((row) => row.vehicleType === vehicleType)?._sum?.amountInPaise ?? 0,
        ]),
      ) as AdminReportLocation['revenueByVehicleType'];

      const totalRevenueInPaise = Object.values(revenueByMethod).reduce(
        (sum, value) => sum + value,
        0,
      );

      return {
        locationId: location.id,
        locationName: location.name,
        totalBookings,
        confirmedBookings,
        rejectedBookings,
        cancelledBookings,
        totalRevenueInPaise,
        revenueByMethod,
        revenueByVehicleType,
      };
    }),
  );

  return {
    range: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null },
    locations: summaries,
  };
}
