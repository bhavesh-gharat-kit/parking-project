/**
 * Session tokens: minting one, and reading one back off a request.
 *
 * Auth.js's JWT session strategy (decisions.md D3) does not issue a plain signed
 * JWT — it issues an **encrypted** one (a JWE, A256CBC-HS512), whose key is
 * derived from `AUTH_SECRET` by HKDF with a salt. That salt is not a free choice:
 * `getToken()` defaults it to the session *cookie* name, so anything that mints a
 * token by hand has to use the same string or the token it produces is
 * undecryptable by the very helper meant to read it.
 *
 * Hence `SESSION_SALT` below, used in exactly three places that must agree:
 *   - `issueSessionToken` here (the mobile Bearer token),
 *   - `readSessionClaims` here (verifying it),
 *   - the `cookies.sessionToken.name` override in `apps/api/auth.ts` (the cookie
 *     the Phase 2 website will get).
 *
 * Because all three line up, `readSessionClaims` accepts either transport — a
 * `Bearer` header from the app or a session cookie from a browser — which is what
 * makes one set of route handlers serve both clients (D3's last bullet).
 */
import { encode, getToken, type JWT } from 'next-auth/jwt';

import type { UserRole } from '@parking/shared';

import { env } from '@/lib/env';

/**
 * Auth.js prefixes the cookie with `__Secure-` when the site is served over
 * HTTPS, and the salt follows the cookie name. Deriving it from `AUTH_URL` rather
 * than from each request's protocol keeps it stable behind Nginx, where the app
 * itself sees plain HTTP (Phase 11).
 *
 * Practical consequence: changing `AUTH_URL` between http and https invalidates
 * existing sessions, exactly as rotating `AUTH_SECRET` would. Worth knowing on
 * the day the VPS gets its certificate.
 */
const usesSecureCookies = new URL(env.AUTH_URL).protocol === 'https:';

export const SESSION_COOKIE_NAME = usesSecureCookies
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

/** Identical to the cookie name — see the module note above for why. */
const SESSION_SALT = SESSION_COOKIE_NAME;

export const SESSION_MAX_AGE_SECONDS = env.AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

export const SESSION_COOKIE_SECURE = usesSecureCookies;

/**
 * What this system puts in a session token, beyond the `iat`/`exp`/`jti` Auth.js
 * adds itself.
 *
 * `userId` duplicates `sub`. `sub` is there because Auth.js and every JWT tool
 * expect it; `userId` is there because the phase spec names it and because a
 * reader of a route handler should not have to know that `sub` means "our user
 * id". They are written together and never diverge.
 *
 * `role` is a claim about what the account was at sign-in. It is what the app
 * routes on — and it is NOT what `lib/auth/guard.ts` authorises on. See that file.
 */
export type SessionClaims = JWT & {
  sub: string;
  userId: string;
  role: UserRole;
  email: string;
  name: string | null;
  picture: string | null;
};

export type SessionSubject = {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: UserRole;
};

/**
 * Mints the session JWT the mobile app stores in `expo-secure-store`.
 *
 * `expiresAt` is returned alongside so the app can tell "my token is stale, go to
 * sign-in" apart from "the server rejected me", without decrypting anything — it
 * has no key to decrypt with, and should not.
 */
export async function issueSessionToken(
  subject: SessionSubject,
): Promise<{ token: string; expiresAt: string }> {
  const claims: SessionClaims = {
    sub: subject.id,
    userId: subject.id,
    role: subject.role,
    email: subject.email,
    name: subject.name,
    picture: subject.imageUrl,
  };

  const token = await encode({
    token: claims,
    secret: env.AUTH_SECRET,
    salt: SESSION_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return {
    token,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  };
}

/**
 * Reads and verifies the session token on a request, from the `Authorization:
 * Bearer` header (mobile) or the session cookie (Phase 2 website).
 *
 * Returns `null` for anything that is not a currently-valid token — absent,
 * malformed, tampered with, encrypted under a rotated secret, or expired
 * (`jose` enforces `exp` during decryption). Callers therefore only have to
 * handle "yes" and "no", never "maybe".
 */
export async function readSessionClaims(
  req: Request | { headers: Headers },
): Promise<SessionClaims | null> {
  const token = await getToken({
    req,
    secret: env.AUTH_SECRET,
    salt: SESSION_SALT,
    cookieName: SESSION_COOKIE_NAME,
    secureCookie: usesSecureCookies,
  });

  if (!token) return null;

  // A token that decrypted but lacks the claims we put in it is not one of ours
  // — an Auth.js token minted before this phase, say. Treat it as unauthenticated
  // rather than reading `undefined` as a user id.
  const userId = typeof token.userId === 'string' ? token.userId : token.sub;
  if (!userId || typeof token.role !== 'string') return null;

  return { ...token, sub: userId, userId } as SessionClaims;
}
