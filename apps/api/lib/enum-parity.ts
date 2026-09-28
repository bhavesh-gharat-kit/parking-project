/**
 * Compile-time guard that the database enums and the shared enums never drift.
 *
 * `prisma/schema.prisma` declares each enum for MySQL; `packages/shared/src/enums.ts`
 * declares the same values for the mobile app, which cannot import Prisma. Two
 * declarations of one truth is the trade-off documented in the README — this file
 * is what stops it turning into a bug: add a value in one place only, and
 * `npm run typecheck` fails here rather than the app mis-parsing a status at
 * runtime.
 *
 * Types only — no runtime cost, nothing to import.
 */
import type {
  BookingStatus as SharedBookingStatus,
  DevicePlatform as SharedDevicePlatform,
  PaymentMethod as SharedPaymentMethod,
  PaymentStatus as SharedPaymentStatus,
  UserRole as SharedUserRole,
  VehicleType as SharedVehicleType,
} from '@parking/shared';

import type {
  BookingStatus as DbBookingStatus,
  DevicePlatform as DbDevicePlatform,
  PaymentMethod as DbPaymentMethod,
  PaymentStatus as DbPaymentStatus,
  UserRole as DbUserRole,
  VehicleType as DbVehicleType,
} from '@/generated/prisma/enums';

/**
 * Exact type equality. The conditional-function-signature trick is needed
 * because a plain `A extends B ? ... : ...` treats a union as assignable to a
 * wider one, so it would happily pass when one side has an extra value.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Errors with "Type 'false' does not satisfy the constraint 'true'" when the two
 * enums differ, naming the line below so it is obvious which enum drifted.
 */
type AssertSame<T extends true> = T;

type _UserRoleParity = AssertSame<Equals<SharedUserRole, DbUserRole>>;
type _VehicleTypeParity = AssertSame<Equals<SharedVehicleType, DbVehicleType>>;
type _BookingStatusParity = AssertSame<Equals<SharedBookingStatus, DbBookingStatus>>;
type _PaymentStatusParity = AssertSame<Equals<SharedPaymentStatus, DbPaymentStatus>>;
type _PaymentMethodParity = AssertSame<Equals<SharedPaymentMethod, DbPaymentMethod>>;
type _DevicePlatformParity = AssertSame<Equals<SharedDevicePlatform, DbDevicePlatform>>;

/** Keeps the aliases above referenced so nothing prunes them as unused. */
export type EnumParityReport = {
  userRole: _UserRoleParity;
  vehicleType: _VehicleTypeParity;
  bookingStatus: _BookingStatusParity;
  paymentStatus: _PaymentStatusParity;
  paymentMethod: _PaymentMethodParity;
  devicePlatform: _DevicePlatformParity;
};
