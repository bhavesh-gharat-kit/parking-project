/**
 * Auth/session store — scaffold only.
 *
 * Phase 01 deliberately contains no auth logic (see the phase prompt's
 * "out of scope"). What it does establish is the shape the rest of the app codes
 * against, and the one rule that matters: `role` is whatever the backend put in
 * the session JWT, never something the UI chooses (context.txt §4 — the login
 * screen must not offer an "Admin" option).
 *
 * Phase 02 replaces `devSetSession` with real sign-in, persists the token to
 * `expo-secure-store` (decisions.md D3), and wires `setAuthTokenProvider` from
 * `src/lib/api.ts` to read from here.
 */
import { create } from 'zustand';

import type { UserRole } from '@parking/shared';

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

type AuthState = {
  /** Undefined while the persisted token is still being read at startup. */
  status: 'loading' | 'signedOut' | 'signedIn';
  token: string | null;
  user: SessionUser | null;

  /**
   * DEV ONLY. Lets the placeholder screens reach both navigation stacks before
   * Phase 02 exists. Delete this when real sign-in lands — a production build
   * must have no code path that sets a role without a verified token.
   */
  devSetSession: (user: SessionUser) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'signedOut',
  token: null,
  user: null,

  devSetSession: (user) =>
    set({
      status: 'signedIn',
      user,
      // No token: nothing in Phase 01 calls an authenticated endpoint, and a
      // fake token would only hide a missing-auth bug.
      token: null,
    }),

  signOut: () => set({ status: 'signedOut', user: null, token: null }),
}));

/** Convenience selectors — keep components from re-rendering on unrelated changes. */
export const selectIsAdmin = (state: AuthState) => state.user?.role === 'ADMIN';
export const selectIsSignedIn = (state: AuthState) => state.status === 'signedIn';
