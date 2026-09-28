/**
 * Auth.js (NextAuth v5) configuration — decisions.md D3.
 *
 * JWT session strategy, no database sessions: `schema.prisma` has no `Session` or
 * `Account` table because nothing needs persisting between requests beyond the
 * `User` row itself.
 *
 * Two providers, both Credentials, both ending in the same JWT:
 *   - `credentials`   — email + password, bcrypt-checked.
 *   - `google-mobile` — a Google ID token the app obtained natively, verified
 *     server-side. Not the stock Google provider, which is a browser redirect
 *     flow a React Native app has nowhere to come back to.
 *
 * ── What uses this file, and what does not ──────────────────────────────────
 *
 * This is the **cookie-session** half of D3, i.e. the Phase 2 website: it signs
 * in through `/api/auth/*`, Auth.js sets `authjs.session-token`, and the browser
 * sends it back automatically.
 *
 * The mobile app does NOT go through Auth.js's own endpoints. It cannot usefully:
 * `signIn()` answers a browser with a redirect and a `Set-Cookie`, so a native
 * client would have to post a CSRF double-submit pair to
 * `/api/auth/callback/credentials`, follow a redirect it does not want, scrape
 * `Set-Cookie`, and turn a redirect-to-`?error=CredentialsSignin` back into a
 * message a customer can read. Instead the app posts to the small JSON handlers
 * under `app/api/auth/{register,login,google}`, which call the *same*
 * `lib/auth/users.ts` functions the `authorize` callbacks below call, then mint
 * the token with `issueSessionToken`.
 *
 * Both halves therefore produce the identical token, encrypted with the identical
 * salt (`lib/auth/session.ts` explains why the salt has to match), so
 * `lib/auth/guard.ts` authorises a browser cookie and a mobile Bearer header with
 * one code path. Sign-in logic lives in one place; only the transport differs.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import type { UserRole } from '@parking/shared';

import { AuthFailure } from '@/lib/auth/errors';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/session';
import { authenticateWithGoogle, authenticateWithPassword } from '@/lib/auth/users';
import { env } from '@/lib/env';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,

  /**
   * Required behind Nginx (Phase 11): without it Auth.js refuses to trust the
   * `X-Forwarded-Host`/`X-Forwarded-Proto` headers the proxy sets and builds its
   * callback URLs from the internal `localhost:3000` instead.
   */
  trustHost: true,

  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },

  /**
   * Pinned rather than left to Auth.js's own http/https sniffing. The cookie name
   * doubles as the JWT's HKDF salt, and `lib/auth/session.ts` mints mobile tokens
   * against this exact string — if Auth.js picked a different name per request,
   * the website's cookie and the app's Bearer token would be mutually
   * unreadable.
   */
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: SESSION_COOKIE_SECURE,
      },
    },
  },

  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        try {
          const user = await authenticateWithPassword(email.trim().toLowerCase(), password);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.imageUrl,
            role: user.role,
          };
        } catch (error) {
          // Auth.js turns a thrown error into a generic `CredentialsSignin` for
          // the browser either way, so there is nothing to gain by rethrowing —
          // but the reason belongs in the server log.
          if (error instanceof AuthFailure) {
            console.warn(`[auth] credentials sign-in refused: ${error.code}`);
            return null;
          }
          throw error;
        }
      },
    }),

    /**
     * The native Google path (D3). `idToken` is treated as hostile input until
     * `lib/auth/google.ts` has checked its signature and audience.
     */
    Credentials({
      id: 'google-mobile',
      name: 'Google',
      credentials: {
        idToken: { label: 'Google ID token', type: 'text' },
      },
      async authorize(credentials) {
        const idToken = typeof credentials?.idToken === 'string' ? credentials.idToken : '';
        if (!idToken) return null;

        try {
          const user = await authenticateWithGoogle(idToken);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.imageUrl,
            role: user.role,
          };
        } catch (error) {
          if (error instanceof AuthFailure) {
            console.warn(`[auth] google sign-in refused: ${error.code}`);
            return null;
          }
          throw error;
        }
      },
    }),
  ],

  callbacks: {
    /**
     * Runs on sign-in (with `user` set) and on every later session read (without
     * it). The claims are written once and then carried, which is why they are
     * a snapshot — `lib/auth/guard.ts` re-reads the database for authorisation.
     */
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.userId = user.id;
        token.role = (user as { role?: UserRole }).role ?? 'USER';
      }
      return token;
    },

    /**
     * Puts `id` and `role` on `session.user` so a server component in the Phase 2
     * dashboard can branch without a second query. Note this is the website's
     * convenience only: an API route still authorises through `requireRole`.
     */
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? token.sub ?? session.user.id;
        session.user.role = (token.role as UserRole | undefined) ?? 'USER';
      }
      return session;
    },
  },
});
