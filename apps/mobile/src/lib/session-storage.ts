/**
 * Where the session token lives on the device.
 *
 * `expo-secure-store`, never AsyncStorage (decisions.md D3, and a Phase 02
 * acceptance criterion). AsyncStorage is a plaintext SQLite file in the app's
 * sandbox: readable by anyone with adb access on a debuggable build, by a rooted
 * phone's file manager, and by any Android backup that includes app data. Our
 * token is a bearer credential valid for 30 days — on Android SecureStore keeps it
 * in `EncryptedSharedPreferences`, with the key held by the OS keystore.
 *
 * Two entries rather than one:
 *   - the token, which is the credential;
 *   - the last-known user, which is a *cache* so the app can open the right
 *     navigation stack on launch instead of showing a spinner while `/api/auth/me`
 *     answers. Nothing is authorised from it; `me` overwrites it moments later, and
 *     the backend re-checks the role on every privileged request regardless.
 *
 * SecureStore values are capped at 2048 bytes on Android. The encrypted Auth.js
 * token runs a few hundred characters and the cached user well under that, so
 * neither is near the limit — but a write that ever grows must keep that in mind.
 */
import * as SecureStore from 'expo-secure-store';

import { SessionUserSchema, type SessionUser } from '@parking/shared';

const TOKEN_KEY = 'payandpark.session.token';
const USER_KEY = 'payandpark.session.user';

export type StoredSession = {
  token: string;
  user: SessionUser;
};

export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, session.token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
  ]);
}

/**
 * Reads the stored session, or `null` if there is nothing usable.
 *
 * Every failure mode collapses to `null` — no token, no cached user, unparseable
 * JSON, a cached user in an older shape, or a keystore that refuses to decrypt
 * after an OS restore. The worst outcome of returning `null` is that the customer
 * signs in again; the worst outcome of trusting a half-read session is a crash on
 * the launch screen.
 */
export async function readSession(): Promise<StoredSession | null> {
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);

    if (!token || !rawUser) return null;

    const user = SessionUserSchema.safeParse(JSON.parse(rawUser));
    if (!user.success) return null;

    return { token, user: user.data };
  } catch (error) {
    console.warn('[session-storage] could not read the stored session:', error);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  } catch (error) {
    // Signing out must never fail. The in-memory store is cleared by the caller
    // either way, so the session is over even if the keystore write did not land.
    console.warn('[session-storage] could not clear the stored session:', error);
  }
}
