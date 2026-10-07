/**
 * Runtime configuration read from the bundled `EXPO_PUBLIC_*` variables.
 *
 * Mirrors `apps/mobile/src/lib/config.ts`'s "read once, validate at startup"
 * approach, but without the `zod` dependency — this app's dependency list is
 * deliberately minimal and a single URL doesn't need a schema library.
 */
const rawWebBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '';

function parseBaseUrl(value: string): { url: string; origin: string } {
  if (!value) {
    throw new Error('EXPO_PUBLIC_WEB_BASE_URL is not set — copy apps/mobile-lite/.env.example to .env');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_WEB_BASE_URL must be a full URL, e.g. http://10.0.2.2:3000');
  }

  return {
    // A trailing slash would produce `//web`.
    url: value.replace(/\/+$/, ''),
    origin: parsed.origin,
  };
}

const { url: webBaseUrl, origin: webOrigin } = parseBaseUrl(rawWebBaseUrl);

export const config = {
  webBaseUrl,
  webOrigin,
  webEntryUrl: `${webBaseUrl}/web`,
};

export type AppConfig = typeof config;
