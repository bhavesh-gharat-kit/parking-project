/**
 * The native Google sign-in half of decisions.md D3.
 *
 * The app obtains the Google ID token itself and posts it to the backend, which
 * verifies it (`apps/api/lib/auth/google.ts`). Auth.js's stock Google provider is
 * a browser redirect flow, which a native app has nowhere to return to.
 *
 * ── The webClientId thing ───────────────────────────────────────────────────
 *
 * `configure` is given the **web** OAuth client ID, not the Android one, and this
 * trips up everyone once. Google issues the ID token audienced to whatever client
 * is named here, and a backend can only verify a token whose audience it owns —
 * so naming the web client is what makes the token verifiable server-side. The
 * Android client ID still has to exist in Google Cloud Console, matching the
 * package name and the SHA-1 of the EAS signing key, because that is what
 * authorises the app to ask at all. It is just not what we pass here.
 *
 * ── Why this cannot run in Expo Go ──────────────────────────────────────────
 *
 * This is a native module. Expo Go ships a fixed set of them and this is not one,
 * so Google sign-in needs the dev client from `eas.json`'s `development` profile
 * (see the README's "Why a dev client"). `isGoogleSignInAvailable` below is what
 * keeps that from being a crash: in Expo Go the module is absent, and the sign-in
 * screen hides the Google button and leaves email/password working.
 */
import { config } from './config';

/**
 * Required at build time, so it is imported lazily — a static import would throw
 * at module load in Expo Go, before the screen can decide to hide the button.
 */
type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let moduleCache: GoogleSignInModule | null = null;
let configured = false;

function loadModule(): GoogleSignInModule | null {
  if (moduleCache) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('@react-native-google-signin/google-signin') as GoogleSignInModule;
    return moduleCache;
  } catch {
    return null;
  }
}

/**
 * Whether to offer the Google button at all. False when the native module is
 * missing (Expo Go) or `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` was not set at build
 * time — in both cases the button could only fail, so the screen omits it.
 */
export function isGoogleSignInAvailable(): boolean {
  return Boolean(config.googleWebClientId) && loadModule() !== null;
}

/** Idempotent; `configure` is cheap and safe to call more than once. */
function ensureConfigured(module: GoogleSignInModule): void {
  if (configured) return;
  module.GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    // Only the ID token is wanted. `offlineAccess` would additionally return a
    // server auth code for calling Google APIs as the user, which this app has no
    // reason to do — asking for it would be scope we cannot justify.
    offlineAccess: false,
  });
  configured = true;
}

export class GoogleSignInError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GoogleSignInError';
  }
}

/**
 * Runs the Google account picker and returns the ID token.
 *
 * `null` means the customer backed out — a cancel is not an error and the screen
 * should show nothing at all for it. Everything else throws a
 * `GoogleSignInError` whose message is safe to display.
 */
export async function requestGoogleIdToken(): Promise<string | null> {
  const module = loadModule();

  if (!module) {
    throw new GoogleSignInError(
      'Google sign-in is not available in this build. Use the development build, or sign in with your email and password.',
    );
  }

  if (!config.googleWebClientId) {
    throw new GoogleSignInError(
      'Google sign-in is not configured in this build. Please sign in with your email and password.',
    );
  }

  ensureConfigured(module);

  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = module;

  try {
    // Fails on a device without Play Services (some tablets, some emulator
    // images) — worth catching separately so the message says why.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (error) {
    throw new GoogleSignInError(
      'Google Play Services is unavailable on this device, so Google sign-in cannot be used. Please sign in with your email and password.',
      { cause: error },
    );
  }

  try {
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) return null; // cancelled

    const idToken = response.data.idToken;
    if (!idToken) {
      // Almost always a misconfigured webClientId, or an Android OAuth client
      // whose SHA-1 does not match the certificate this build was signed with.
      throw new GoogleSignInError(
        'Google did not return a sign-in token. Check the app’s Google client configuration.',
      );
    }

    return idToken;
  } catch (error) {
    if (error instanceof GoogleSignInError) throw error;

    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS) {
        throw new GoogleSignInError('A Google sign-in is already in progress.', { cause: error });
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInError(
          'Google Play Services is unavailable on this device. Please sign in with your email and password.',
          { cause: error },
        );
      }
    }

    console.error('[google-auth] sign-in failed:', error);
    throw new GoogleSignInError('Google sign-in failed. Please try again.', { cause: error });
  }
}

/**
 * Clears the native Google session so the account picker appears again next time.
 *
 * Without this, signing out of this app and tapping the Google button silently
 * signs the same account straight back in — which looks broken on a shared phone
 * at a parking counter. Never throws: sign-out must not be blockable.
 */
export async function signOutOfGoogle(): Promise<void> {
  const module = loadModule();
  if (!module) return;
  try {
    await module.GoogleSignin.signOut();
  } catch (error) {
    console.warn('[google-auth] could not clear the native Google session:', error);
  }
}
