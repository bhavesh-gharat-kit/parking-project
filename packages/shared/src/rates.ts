/**
 * Parking rate (package) request/response contracts (context.txt §7, §24).
 *
 * `label` is never part of the request: it is derived server-side from
 * `durationMinutes` with `formatDuration` (schema.prisma's own comment — "the
 * authoritative duration... never from parsing `label`") so "90 minutes" can
 * never end up mislabelled "2 Hours" by a typo in the admin form.
 *
 * The request takes rupees, not paise — a parking-lot admin types "70", not
 * "7000" — and `rupeesToPaise` converts on the way in, matching every other
 * `...InPaise` column's rule that a client never sends paise directly except
 * where an integer amount is unavoidable (Booking, Payment).
 */
import { z } from 'zod';

import { VehicleTypeSchema } from './enums';
import { rupeesToPaise } from './money';

/**
 * `POST /api/admin/locations/:id/rates`, `PATCH .../rates/:rateId`.
 *
 * `priceInRupees` keeps its name through the transform (input: rupees the
 * admin typed, output: paise) rather than being renamed to `priceInPaise` —
 * a per-field `.transform`, not a whole-object one, so `Control<T>`'s
 * `TFieldValues`/`TTransformedValues` stay the same shape and `TextField`
 * (typed `Control<T>`, same as every other form here) still lines up. The
 * route handler reads the paise value out of the same-named field.
 */
export const ParkingRateRequestSchema = z.object({
  vehicleType: VehicleTypeSchema,
  /** Minutes. "Full Day" is 1440 (schema.prisma convention). */
  durationMinutes: z.coerce
    .number({ error: 'Enter a duration' })
    .int('Whole minutes only')
    .positive('Duration must be greater than 0')
    .max(10080, 'Keep it to a week or less'),
  /** Input: rupees the admin typed. Output (post-transform): paise. */
  priceInRupees: z.coerce
    .number({ error: 'Enter a price' })
    .positive('Price must be greater than ₹0')
    .max(100000, 'Keep the price under ₹1,00,000')
    .transform((rupees) => rupeesToPaise(rupees)),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type ParkingRateRequest = z.input<typeof ParkingRateRequestSchema>;
export type ParkingRateRequestParsed = z.output<typeof ParkingRateRequestSchema>;

/** What the customer's package list sees — never `isActive` (already filtered). */
export const ParkingRateSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  vehicleType: VehicleTypeSchema,
  label: z.string(),
  durationMinutes: z.number(),
  priceInPaise: z.number(),
  sortOrder: z.number(),
});
export type ParkingRate = z.infer<typeof ParkingRateSchema>;

/** What the admin rate-management screen sees. */
export const AdminParkingRateSchema = ParkingRateSchema.extend({
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminParkingRate = z.infer<typeof AdminParkingRateSchema>;
