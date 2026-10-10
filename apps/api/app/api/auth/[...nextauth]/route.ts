/**
 * Auth.js's own endpoints: `/api/auth/signin`, `/signout`, `/session`, `/csrf`,
 * `/providers`, `/callback/*`, `/error`.
 *
 * These serve the **browser** — the Phase 2 website's cookie session (decisions.md
 * D3). The mobile app uses the JSON siblings in `../{login,register,google,me}`;
 * `apps/api/auth.ts` explains why it cannot sensibly use these.
 *
 * Those siblings are static segments, and Next.js resolves a static segment ahead
 * of a catch-all, so they take precedence over this route rather than being
 * swallowed by it. The corollary is that a future handler here must not be named
 * after one of Auth.js's paths listed above — `app/api/auth/session/route.ts`
 * would silently shadow Auth.js's session endpoint.
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;

/** Prisma's driver adapter and bcrypt need Node APIs; not edge-compatible. */
export const runtime = 'nodejs';
