/**
 * Vehicle request/response contracts (context.txt §5).
 *
 * One schema for both create and update: the add and edit forms in the RN app
 * post the whole vehicle every time, so there is no partial-update variant to
 * keep in sync with the full one.
 */
import { z } from 'zod';

import { VehicleTypeSchema } from './enums';
import { VehicleNumberSchema } from './schemas';

/** Empty string means "not supplied", same convention as `OptionalIndianPhoneSchema`. */
const OptionalMakeModelSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(60, 'Keep it under 60 characters').optional(),
);

/** `POST /api/vehicles`, `PATCH /api/vehicles/:id`. */
export const VehicleRequestSchema = z.object({
  number: VehicleNumberSchema,
  type: VehicleTypeSchema,
  makeModel: OptionalMakeModelSchema,
});
export type VehicleRequest = z.input<typeof VehicleRequestSchema>;
export type VehicleRequestParsed = z.output<typeof VehicleRequestSchema>;

/** A vehicle as every client sees it — never the `userId` or `isActive` bookkeeping. */
export const VehicleSchema = z.object({
  id: z.string(),
  number: z.string(),
  type: VehicleTypeSchema,
  makeModel: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;
