/**
 * Push token registration contract (decisions.md D4).
 *
 * The RN app posts here once it has an Expo push token — after sign-in, and
 * again any time Expo hands it a new one. There is no response payload beyond
 * the envelope's `ok: true`: the app already knows the token it just sent, and
 * has nothing else to do with the result.
 */
import { z } from 'zod';

import { DevicePlatformSchema } from './enums';

/** `POST /api/push-tokens`. */
export const RegisterPushTokenRequestSchema = z.object({
  /** An Expo push token, "ExponentPushToken[xxxxx]" — not validated further here; an
   *  unrecognised format simply never yields a delivered notification (`lib/push/send.ts`
   *  skips anything `Expo.isExpoPushToken` rejects). */
  token: z.string().trim().min(1, 'A push token is required').max(255),
  platform: DevicePlatformSchema.default('ANDROID'),
  deviceName: z.string().trim().max(120).optional(),
});
export type RegisterPushTokenRequest = z.input<typeof RegisterPushTokenRequestSchema>;
export type RegisterPushTokenRequestParsed = z.output<typeof RegisterPushTokenRequestSchema>;
