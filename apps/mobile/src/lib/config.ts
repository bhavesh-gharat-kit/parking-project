/**
 * Runtime configuration read from the bundled `EXPO_PUBLIC_*` variables.
 *
 * Read once here and validated, so a forgotten variable shows up as one clear
 * error at startup instead of a confusing `fetch("undefined/api/...")` later.
 */
import { z } from 'zod';

const ConfigSchema = z.object({
  apiBaseUrl: z
    .string()
    .min(1, 'EXPO_PUBLIC_API_BASE_URL is not set — copy apps/mobile/.env.example to .env')
    .url('EXPO_PUBLIC_API_BASE_URL must be a full URL, e.g. http://10.0.2.2:3000')
    // A trailing slash would produce `//api/health`.
    .transform((value) => value.replace(/\/+$/, '')),
  apiTimeoutMs: z.coerce.number().int().positive().default(20_000),
  googleWebClientId: z.string().default(''),
  googleAndroidClientId: z.string().default(''),
});

const timeoutSeconds = process.env.EXPO_PUBLIC_API_TIMEOUT_SECONDS;

export const config = ConfigSchema.parse({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  apiTimeoutMs: timeoutSeconds ? Number(timeoutSeconds) * 1000 : undefined,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
});

export type AppConfig = typeof config;
