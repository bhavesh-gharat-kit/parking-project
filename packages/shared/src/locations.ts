/**
 * Parking location request/response contracts (context.txt §3, §6, §23).
 *
 * Two response shapes, same as `ParkingLocation`'s two audiences:
 * `ParkingLocationSchema` is what the customer app renders in the location
 * picker (§6 — never hardcoded, always fetched); `AdminParkingLocationSchema`
 * adds the bookkeeping fields (`code`, `capacity`, `isActive`, timestamps) the
 * admin screens need but a customer never sees.
 */
import { z } from 'zod';

import { OptionalIndianPhoneSchema, OptionalUpiVpaSchema } from './schemas';

/** Empty string means "not supplied", same convention as `OptionalIndianPhoneSchema`. */
const OptionalUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().url('Enter a valid image URL').max(2048).optional(),
);

/** Branch code prefix used on a booking number, e.g. "KLY" (§17, Phase 05). */
export const ParkingLocationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,8}$/, 'Use 2-8 letters/numbers, e.g. KLY');

/** `POST /api/admin/locations`, `PATCH /api/admin/locations/:id`. */
export const ParkingLocationRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: ParkingLocationCodeSchema,
  addressLine: z.string().trim().min(1, 'Address is required').max(255),
  city: z.string().trim().min(1, 'City is required').max(80),
  state: z.string().trim().min(1, 'State is required').max(80),
  pincode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(10).optional(),
  ),
  contactPhone: OptionalIndianPhoneSchema,
  /** §20 — a soft headcount for the admin dashboard, not a slot table (D2). */
  capacity: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().positive().max(100000).optional(),
  ),
  /** §6, §23 — an inactive location disappears from the customer's list. */
  isActive: z.boolean().default(true),
  /** §11, Phase 06 — the VPA shown on this branch's UPI payment screen. */
  upiVpa: OptionalUpiVpaSchema,
  /** §11, Phase 06 — the static QR image the app displays for UPI payment. */
  upiQrImageUrl: OptionalUrlSchema,
});
export type ParkingLocationRequest = z.input<typeof ParkingLocationRequestSchema>;
export type ParkingLocationRequestParsed = z.output<typeof ParkingLocationRequestSchema>;

/** What the customer app's location picker sees — always the active list (§6). */
export const ParkingLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string().nullable(),
  contactPhone: z.string().nullable(),
});
export type ParkingLocation = z.infer<typeof ParkingLocationSchema>;

/** What the admin location list/edit screens see. */
export const AdminParkingLocationSchema = ParkingLocationSchema.extend({
  code: z.string(),
  capacity: z.number().nullable(),
  isActive: z.boolean(),
  /** §11, Phase 06 — null until the admin configures this branch's UPI payment. */
  upiVpa: z.string().nullable(),
  upiQrImageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminParkingLocation = z.infer<typeof AdminParkingLocationSchema>;
