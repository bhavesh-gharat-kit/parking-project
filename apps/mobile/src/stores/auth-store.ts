/**
 * The session: who is signed in, and the three ways to become so.
 *
 * One rule governs this file, from context.txt §4 and §110-112: **`role` is
 * whatever the backend said it is.** There is no action here that takes a role,
 * no way for a screen to set one, and the sign-in screen offers no such choice.
 * The Phase 01 `devSetSession` helper, which faked one to make both navigation
 * stacks reachable, is gone.
 *
 * `role` is used for exactly one thing on this side: choosing which stack to open
 * (`src/app/index.tsx`). It is not a permission. Every privileged endpoint
 * re-derives the role from the database on each request
 * (`apps/api/lib/auth/guard.ts`), so a tampered client can open admin *screens*
 * and still have every admin *call* answered with 403.
 *
 * ── The startup sequence ────────────────────────────────────────────────────
 *
 * `status` starts `loading` and `restore()` resolves it, so no screen has to cope
 * with "signed out, or just not read yet" — a distinction that otherwise shows up
 * as the sign-in screen flashing on every cold start.
 *
 *   1. Read the token and cached user from SecureStore.
 *   2. Nothing stored → `signedOut`.
 *   3. Something stored → go `signedIn` immediately off the cache, so the right
 *      stack renders at once, then confirm with `GET /api/auth/me` in the
 *      background. That call is what picks up a role changed in MySQL, and a 401
 *      from it clears the session.
 *
 * Step 3 trusts the cache for a moment on purpose. The alternative — blocking the
 * splash screen on a network round trip — makes the app unusable on the weak
 * signal a parking gate actually has, to protect a value that cannot grant
 * anything the server has not already agreed to.
 */
import { create } from 'zustand';

import {
  type AuthSession,
  type GoogleSignInRequest,
  type LoginRequestParsed,
  type MeResponse,
  type RegisterRequestParsed,
  type SessionUser,
} from '@parking/shared';

import { requestGoogleIdToken, signOutOfGoogle } from '@/lib/google-auth';
import { apiRequest } from '@/lib/api';
import { clearSession, readSession, saveSession } from '@/lib/session-storage';

export type { SessionUser };

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  token: string | null;
  user: SessionUser | null;

  /** Read the persisted session. Called once, from the root layout. */
  restore: () => Promise<void>;

  register: (input: RegisterRequestParsed) => Promise<void>;
  signInWithPassword: (input: LoginRequestParsed) => Promise<void>;
  /** Resolves `false` when the customer dismissed Google's account picker. */
  signInWithGoogle: () => Promise<boolean>;

  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  token: null,
  user: null,

  restore: async () => {
    const stored = await readSession();

    if (!stored) {
      set({ status: 'signedOut', token: null, user: null });
      return;
    }

    set({ status: 'signedIn', token: stored.token, user: stored.user });

    // Not awaited by the caller: the UI is already up. `apiRequest` reads the
    // token through the provider registered in the root layout, which is reading
    // the state just set above.
    try {
      const { user } = await apiRequest<MeResponse>('/api/auth/me');
      set({ user });
      await saveSession({ token: stored.token, user });
    } catch (error) {
      // A 401 has already been handled by the unauthorized handler (which signs
      // out); anything else is the server being unreachable, and an offline
      // customer should keep the session they had rather than be logged out.
      console.warn('[auth-store] could not refresh the session:', error);
    }
  },

  register: async (input) => {
    const session = await apiRequest<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: input,
      anonymous: true,
    });
    await adopt(set, session);
  },

  signInWithPassword: async (input) => {
    const session = await apiRequest<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: input,
      anonymous: true,
    });
    await adopt(set, session);
  },

  signInWithGoogle: async () => {
    const idToken = await requestGoogleIdToken();
    if (!idToken) return false;

    const body: GoogleSignInRequest = { idToken };
    const session = await apiRequest<AuthSession>('/api/auth/google', {
      method: 'POST',
      body,
      anonymous: true,
    });
    await adopt(set, session);
    return true;
  },

  signOut: async () => {
    const hadUser = get().user !== null;

    // In-memory state first, so the navigation guards react immediately and the
    // customer is off their bookings before any I/O is awaited.
    set({ status: 'signedOut', token: null, user: null });

    await clearSession();

    // Only bother with Google if somebody was actually signed in — this pops no
    // UI, but it is a native call worth skipping on a no-op sign-out.
    if (hadUser) await signOutOfGoogle();
  },
}));

/**
 * Adopts a freshly issued session: persist first, then flip the state.
 *
 * That order matters. If the SecureStore write fails, the customer sees the
 * failure now and can retry, rather than getting into the app and being silently
 * signed out on their next cold start — which at a parking gate is the worse
 * place to discover it.
 */
async function adopt(
  set: (partial: Partial<AuthState>) => void,
  session: AuthSession,
): Promise<void> {
  await saveSession({ token: session.token, user: session.user });
  set({ status: 'signedIn', token: session.token, user: session.user });
}

/* ───────────────────────────── Selectors ───────────────────────────── */
/* Passed to `useAuthStore(...)` so a component re-renders only when the value it
   actually reads changes. */

export const selectIsSignedIn = (state: AuthState) => state.status === 'signedIn';
export const selectIsAdmin = (state: AuthState) => state.user?.role === 'ADMIN';
export const selectUser = (state: AuthState) => state.user;
export const selectStatus = (state: AuthState) => state.status;
