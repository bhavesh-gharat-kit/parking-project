/**
 * POST /api/auth/forgot-password/request-otp — step one of a password reset
 * (Phase 15, context.txt §4).
 *
 * Anonymous by design: the caller is a signed-out customer who cannot prove
 * anything yet, which is the whole difficulty. `POST /api/profile/change-password`
 * is the authenticated sibling, and the contrast is the point — that one requires
 * both a session and the current password, this one requires only an address and
 * therefore must give nothing away.
 *
 * Which is why this handler is as short as it is. It has exactly one job beyond
 * parsing: answer the same thing every time. `requestPasswordResetOtp` returns
 * `void` precisely so there is no branch result here to accidentally render —
 * see that function for the four cases it silently distinguishes and the timing
 * work that keeps them indistinguishable from outside.
 *
 * Registration is untouched by this phase: `POST /api/auth/register` still
 * creates an account and signs the customer straight in, with no verification
 * step and no pending state.
 */
import type { NextRequest } from 'next/server';

import {
  ForgotPasswordRequestOtpRequestSchema,
  type ForgotPasswordRequestOtpResponse,
} from '@parking/shared';

import { requestPasswordResetOtp } from '@/lib/auth/password-reset';
import { parseJsonBody, respondWithAuthError } from '@/lib/auth/route-helpers';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req, ForgotPasswordRequestOtpRequestSchema);
  // The one response that is not generic, and unavoidably so: a body that is not
  // an email address at all gets a validation error, because the form has to be
  // able to say "that is not an email". It reveals nothing about accounts —
  // `EmailSchema` is checking shape, and a well-formed address that happens to be
  // unregistered goes down the identical path below.
  if (!body.ok) return body.response;

  try {
    await requestPasswordResetOtp(body.data.email);
  } catch (error) {
    // Only a real fault reaches here (a dead database) — the function throws
    // nothing for "no such account" or "cooldown active", and the email send
    // cannot fail into this catch because it runs in `after()`.
    return respondWithAuthError(error, 'auth/forgot-password/request-otp');
  }

  const payload: ForgotPasswordRequestOtpResponse = { requested: true };
  // `no-store` so no proxy or Nginx cache in front of this can ever serve one
  // customer's reset request as another's, and so a cached 200 cannot make the
  // 60-second cooldown look like a successful resend.
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
