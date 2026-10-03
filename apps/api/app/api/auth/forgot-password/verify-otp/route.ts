/**
 * POST /api/auth/forgot-password/verify-otp — step two of a password reset
 * (Phase 15, context.txt §4).
 *
 * The code from the email plus the new password, in one call. What authorises it
 * is the code and nothing else: there is no session here, and
 * `ForgotPasswordVerifyOtpRequestSchema` has no field that could aim it at a
 * different account than the one the code was issued for.
 *
 * Unlike step one, this handler's failures are specific on purpose — expired,
 * locked out, wrong code with a count of what is left. By the time someone is
 * typing a code they have shown they can read the mailbox, so the enumeration
 * argument that makes `request-otp` deliberately uninformative does not apply,
 * and a customer with a stale code needs to be told to ask for a new one rather
 * than left re-typing a dead one. `lib/auth/password-reset.ts` decides which
 * failure is which.
 *
 * Note what a success does NOT return: a session. See
 * `ForgotPasswordVerifyOtpResponseSchema`.
 */
import type { NextRequest } from 'next/server';

import {
  ForgotPasswordVerifyOtpRequestSchema,
  type ForgotPasswordVerifyOtpResponse,
} from '@parking/shared';

import { resetPasswordWithOtp } from '@/lib/auth/password-reset';
import { parseJsonBody, respondWithAuthError } from '@/lib/auth/route-helpers';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req, ForgotPasswordVerifyOtpRequestSchema);
  if (!body.ok) return body.response;

  try {
    await resetPasswordWithOtp({
      email: body.data.email,
      otp: body.data.otp,
      newPassword: body.data.newPassword,
    });
  } catch (error) {
    return respondWithAuthError(error, 'auth/forgot-password/verify-otp');
  }

  const payload: ForgotPasswordVerifyOtpResponse = { reset: true };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}
