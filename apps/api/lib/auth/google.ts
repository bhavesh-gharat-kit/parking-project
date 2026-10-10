/**
 * Server-side verification of a Google ID token (decisions.md D3).
 *
 * Why the app sends a token instead of following a redirect: Auth.js's stock
 * Google provider is a browser OAuth flow — it redirects, sets a cookie and
 * comes back. A React Native app has no browser session to come back to, so the
 * app runs the native Google flow itself (`@react-native-google-signin`) and
 * posts the resulting ID token here.
 *
 * That makes this file the trust boundary. An ID token arriving over HTTP is
 * just a string a client chose to send: it could be forged, expired, issued for
 * a different app, or belong to an unverified mailbox. Nothing downstream looks
 * at a claim until `verifyIdToken` below has checked the signature against
 * Google's published keys and the audience against our own client IDs.
 */
import { OAuth2Client } from 'google-auth-library';

import { env } from '@/lib/env';
import { AuthFailure } from './errors';

/**
 * Every OAuth client ID that may legitimately be the `aud` of a token we accept.
 *
 * Both are listed because which one appears depends on how the app asked:
 * `@react-native-google-signin` configured with `webClientId` gets a token
 * audienced to the *web* client (that is the documented way to obtain an ID
 * token a backend can verify), while some native paths audience it to the
 * Android client. Accepting both is correct; accepting `undefined` would mean
 * accepting any audience, which is the one thing that must not happen.
 */
function allowedAudiences(): string[] {
  return [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

/** False when neither client ID is configured, i.e. Google sign-in cannot work yet. */
export function isGoogleSignInConfigured(): boolean {
  return allowedAudiences().length > 0;
}

/**
 * The claims we are willing to act on, once verified. Deliberately narrow: the
 * `sub` we key the account on, the email we match/link on, and two cosmetic
 * fields for the profile screen.
 */
export type GoogleIdentity = {
  /** Google's immutable user ID. Stored as `User.googleId`. */
  googleSub: string;
  /** Always lower-cased, to match how `User.email` is stored. */
  email: string;
  name: string | null;
  imageUrl: string | null;
};

/**
 * The client caches Google's signing keys across requests, so this is created
 * once per process rather than per sign-in.
 */
let client: OAuth2Client | null = null;
function oauthClient(): OAuth2Client {
  client ??= new OAuth2Client();
  return client;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audience = allowedAudiences();

  if (audience.length === 0) {
    throw new AuthFailure(
      'SERVICE_UNAVAILABLE',
      'Google sign-in is not configured on this server. Please sign in with your email and password.',
    );
  }

  let payload;
  try {
    // Checks the RS256 signature against Google's current JWKS, that `iss` is
    // Google, that `aud` is one of ours, and that the token has not expired.
    const ticket = await oauthClient().verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch (error) {
    // Logged, not returned: the underlying message names key IDs and audiences,
    // which is useful in the PM2 log and meaningless to a customer.
    console.error('[auth/google] ID token verification failed:', error);
    throw new AuthFailure(
      'UNAUTHORIZED',
      'Google sign-in could not be verified. Please try again.',
      { cause: error },
    );
  }

  if (!payload?.sub) {
    throw new AuthFailure('UNAUTHORIZED', 'Google sign-in returned no account identifier.');
  }

  if (!payload.email) {
    // Every account in this system is keyed on an email (`User.email` is the
    // unique column), so a token without one cannot be turned into a user.
    throw new AuthFailure(
      'UNAUTHORIZED',
      'Your Google account did not share an email address, which this app needs. Please sign in with your email and password instead.',
    );
  }

  if (payload.email_verified !== true) {
    // This matters more than it looks. `authenticateWithGoogle` links a Google
    // login to an existing email/password account by matching the email — if we
    // accepted an unverified address, anyone could create a Google account
    // claiming someone else's email and walk into their bookings.
    throw new AuthFailure(
      'UNAUTHORIZED',
      'Your Google email address is not verified, so it cannot be used to sign in.',
    );
  }

  return {
    googleSub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name?.trim() || null,
    imageUrl: payload.picture ?? null,
  };
}
