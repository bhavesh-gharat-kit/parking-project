/**
 * Admin vehicle lookup — "which active pass/booking does this plate have?".
 *
 * Built for the gate: an admin with a crowd of vehicles types (and, later,
 * speaks) a plate or just its last few digits and gets a one-glance summary.
 * Typed and spoken input both end up as the same `q` string, so this contract
 * is the single seam between the input method and the database.
 */
import { z } from 'zod';

import { VehicleTypeSchema } from './enums';

/**
 * The shortest query the endpoint accepts. Three characters is enough to match
 * "the last digits of a plate" at the gate without letting a one-letter query
 * scan every vehicle in the lot.
 */
export const VEHICLE_LOOKUP_MIN_QUERY_LENGTH = 3;

/**
 * Upper-case and drop everything that is not a letter or digit, so
 * "mh 04-ab 1234" and "MH04AB1234" are the same query. Looser than
 * `VehicleNumberSchema` on purpose: this is a search term, not a stored value,
 * and a partial plate must pass through unchanged.
 */
export function normalizePlateQuery(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const VehicleLookupQuerySchema = z.object({
  q: z
    .string()
    .transform(normalizePlateQuery)
    .refine((value) => value.length >= VEHICLE_LOOKUP_MIN_QUERY_LENGTH, {
      message: `Enter at least ${VEHICLE_LOOKUP_MIN_QUERY_LENGTH} characters of the vehicle number`,
    })
    .refine((value) => value.length <= 14, { message: 'That is longer than a vehicle number' }),
});
export type VehicleLookupQuery = z.infer<typeof VehicleLookupQuerySchema>;

/**
 * Where the matched row sits relative to now. Derived on the server from the
 * row's own start/end instants so every client agrees with it.
 */
export const VEHICLE_LOOKUP_STATES = ['ACTIVE', 'UPCOMING', 'EXPIRED'] as const;
export const VehicleLookupStateSchema = z.enum(VEHICLE_LOOKUP_STATES);
export type VehicleLookupState = z.infer<typeof VehicleLookupStateSchema>;

export const VEHICLE_LOOKUP_STATE_LABELS: Record<VehicleLookupState, string> = {
  ACTIVE: 'Active now',
  UPCOMING: 'Starts later',
  EXPIRED: 'Expired',
};

export const VehicleLookupMatchSchema = z.object({
  kind: z.enum(['PASS', 'BOOKING']),
  /** Id of the `PassBooking`/`Booking`, for linking to its admin detail page. */
  id: z.string(),
  /** Human-readable pass or booking number. */
  reference: z.string(),
  state: VehicleLookupStateSchema,
  vehicleNumber: z.string(),
  vehicleType: VehicleTypeSchema,
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  locationName: z.string(),
  /** Plan label for a pass, rate label for a daily booking. */
  planLabel: z.string(),
  amountInPaise: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export type VehicleLookupMatch = z.infer<typeof VehicleLookupMatchSchema>;

export const VehicleLookupResponseSchema = z.object({
  /** The normalised query the server actually searched for. */
  query: z.string(),
  matches: z.array(VehicleLookupMatchSchema),
});
export type VehicleLookupResponse = z.infer<typeof VehicleLookupResponseSchema>;
