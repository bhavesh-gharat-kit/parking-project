/**
 * Zod schemas shared between the API (request validation) and the mobile app
 * (React Hook Form resolvers).
 *
 * Phase 01 only holds the primitives plus the one demo schema that proves the
 * RHF + Zod + shared-package wiring works end to end. Phases 02-10 add their
 * request/response schemas here so that a route handler and the form that posts
 * to it can never disagree about the shape.
 */
import { z } from 'zod';

/* ──────────────────────────── Primitives ───────────────────────────── */

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required')
  .max(254)
  .email('Enter a valid email address');

/** Indian mobile number: 10 digits starting 6-9, optional +91 / 0 prefix. */
export const IndianPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+91|0091|91|0)/, ''))
  .refine((value) => /^[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit mobile number');

export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Password is too long'); // bcrypt truncates past 72 bytes

/**
 * A phone number that may legitimately be absent — a Google sign-up arrives
 * without one (§4), and the sign-up form leaves the field blank.
 *
 * An empty string has to become `undefined` *before* `IndianPhoneSchema` runs,
 * because that schema's `.refine` would otherwise reject `''` as an invalid
 * number rather than treating it as "not supplied".
 */
export const OptionalIndianPhoneSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  IndianPhoneSchema.optional(),
);

/**
 * Indian registration plate, stored without spaces or dashes: "MH04AB1234".
 * Deliberately permissive — BH-series, older formats and out-of-state plates all
 * have to be typeable at a parking counter, so this checks shape, not a registry.
 */
export const VehicleNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^[A-Z0-9]{4,14}$/.test(value), 'Enter a valid vehicle number');

/**
 * Human-readable booking code, e.g. "KLY-260928-0007" (branch-date-sequence,
 * `apps/api/lib/bookings/booking-number.ts`). The last segment accepts any
 * 4-character `[A-Z0-9]` value rather than `\d{4}` specifically so this schema
 * doesn't need to change if that generator's format ever does again.
 */
export const BookingNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}-\d{6}-[A-Z0-9]{4}$/, 'Enter a valid booking number');

/** A UPI reference/UTR as printed by GPay/PhonePe/Paytm — usually 12 digits. */
export const UpiUtrSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s/g, ''))
  .refine((value) => /^[A-Z0-9]{8,24}$/.test(value), 'Enter the UPI reference exactly as shown in your payment app');

/**
 * Same "empty string means not supplied" convention as `OptionalIndianPhoneSchema`.
 *
 * Phase 15 — the UTR text field became optional once the payment screenshot
 * (which the UTR used to be the only evidence for) became the required one;
 * when a customer does type something, it is still held to the same shape.
 */
export const OptionalUpiUtrSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  UpiUtrSchema.optional(),
);

/** A UPI VPA / payment address, e.g. "business@okhdfcbank" (§11, Phase 06). */
export const UpiVpaSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,64}$/, 'Enter a valid UPI ID, e.g. name@bank');

/** Same "empty string means not supplied" convention as `OptionalIndianPhoneSchema`. */
export const OptionalUpiVpaSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  UpiVpaSchema.optional(),
);

export const CuidSchema = z.string().min(1, 'Required');
