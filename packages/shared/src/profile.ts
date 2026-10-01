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
export const ProfileResponseSchema = z.object({
  user: SessionUserSchema,
  /**
   * Whether this account has a `passwordHash` at all — false for one that only
   * ever signed in with Google (`auth.ts` D3, `schema.prisma`).
   *
   * Here rather than on `SessionUserSchema` on purpose. `SessionUser` is what the
   * app caches in `expo-secure-store` and what `/api/auth/me` refreshes, and this
   * flag is only ever needed by the one screen that offers a password change —
   * putting it on the cached session would mean a stale `true` surviving in
   * SecureStore long after the fact and a form that fails on submit.
   *
   * Not a secret: `GET /api/profile` is `requireUser`-guarded and answers only
   * about the caller's own account, so this tells the account holder something
   * about themselves. It is not exposed anywhere anonymous — the sign-in error
   * for a Google-only account is still the generic `INVALID_CREDENTIALS_MESSAGE`,
   * so this does not become an enumeration oracle.
   */
  hasPassword: z.boolean(),
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

/** `POST /api/profile/change-password` — nothing to return but "it worked". */
export const ChangePasswordResponseSchema = z.object({ changed: z.literal(true) });
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;
