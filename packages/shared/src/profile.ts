/**
 * Profile request/response contracts (context.txt §5).
 *
 * No `email` field on the request: it is the login identifier for both
 * providers (`auth.ts`), so the profile screen shows it read-only and this
 * schema has nothing that could change it.
 */
import { z } from 'zod';

import { SessionUserSchema } from './auth';
import { OptionalIndianPhoneSchema } from './schemas';

/** `PATCH /api/profile`. */
export const UpdateProfileRequestSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: OptionalIndianPhoneSchema,
});
export type UpdateProfileRequest = z.input<typeof UpdateProfileRequestSchema>;
export type UpdateProfileRequestParsed = z.output<typeof UpdateProfileRequestSchema>;

/** `GET /api/profile`, and the response to a successful `PATCH`. */
export const ProfileResponseSchema = z.object({ user: SessionUserSchema });
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
