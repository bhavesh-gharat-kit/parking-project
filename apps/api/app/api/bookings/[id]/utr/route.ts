/**
 * POST /api/bookings/:id/utr — the customer submits proof of UPI payment
 * after paying the QR (context.txt §306-336, Phase 06; Phase 15).
 *
 * IMPORTANT — this never marks the payment `PAID`. It moves the booking to
 * `PAYMENT_VERIFICATION` and the payment to `VERIFICATION_PENDING`; only an
 * admin approving it (Phase 07) can move either further. The screenshot — and
 * the UTR, if the customer also typed one — is evidence for the admin to
 * check, not proof (§32) — `transitionBooking` enforces the "only an admin"
 * half of that by construction (`PAYMENT_VERIFICATION`'s only outgoing moves
 * in `BOOKING_TRANSITIONS` are `CONFIRMED`/`REJECTED`, neither of which this
 * handler asks for).
 *
 * Only reachable from `PENDING_PAYMENT`, which only a `UPI` booking is ever in
 * (`CASH` goes straight to `PENDING_APPROVAL`) — so a cash booking cannot reach
 * this endpoint's success path no matter what it posts.
 *
 * ── Screenshot required, UTR optional (Phase 15) ───────────────────────────
 * A typed UTR is easy to mistype or fake; a screenshot of the payment app is
 * what the admin actually wants to look at. So the request must always be
 * `multipart/form-data` with a `screenshot` file — there is no JSON-only path
 * any more, because a JSON body cannot carry a file. The `utr` field stays,
 * but purely as an optional aid that makes the admin's bank-statement check
 * faster.
 *
 * Because the screenshot is now the one required piece of evidence, a failed
 * upload (bad connection at the gate, media-host outage) is no longer
 * swallowed — unlike before Phase 15, it now fails the request with
 * `SERVICE_UNAVAILABLE` so the customer knows to retry, rather than silently
 * landing the booking in `PAYMENT_VERIFICATION` with no evidence attached.
 */
import type { NextRequest } from 'next/server';

import { BookingUtrSubmitRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { toBooking } from '@/lib/bookings/projection';
import { transitionBooking, transitionFailureMessage } from '@/lib/bookings/transitions';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';
import { mediaHostUpload } from '@/lib/upload/mediaHostProvider';
import { UTR_SCREENSHOT_RULES } from '@/lib/upload/storageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const SCREENSHOT_REQUIRED_MESSAGE = 'Attach a screenshot of your payment confirmation.';

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const owned = await prisma.booking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: { id: true },
  });
  if (!owned) return fail('NOT_FOUND', 'That booking could not be found.');

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return fail('VALIDATION_ERROR', SCREENSHOT_REQUIRED_MESSAGE, {
      fields: { screenshot: [SCREENSHOT_REQUIRED_MESSAGE] },
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('BAD_REQUEST', 'Expected a multipart form body.');
  }

  const parsedUtr = BookingUtrSubmitRequestSchema.safeParse({ utr: form.get('utr') ?? undefined });
  if (!parsedUtr.success) return failValidation(parsedUtr.error);
  const utr = parsedUtr.data.utr;

  const file = form.get('screenshot');
  if (!(file instanceof File) || file.size === 0) {
    return fail('VALIDATION_ERROR', SCREENSHOT_REQUIRED_MESSAGE, {
      fields: { screenshot: [SCREENSHOT_REQUIRED_MESSAGE] },
    });
  }
  if (file.size > UTR_SCREENSHOT_RULES.maxSizeBytes) {
    return fail('VALIDATION_ERROR', 'Screenshot must be 5 MB or smaller.', {
      fields: { screenshot: ['Screenshot must be 5 MB or smaller.'] },
    });
  }
  if (!UTR_SCREENSHOT_RULES.allowedMimeTypes.includes(file.type)) {
    return fail('VALIDATION_ERROR', 'Screenshot must be a JPEG, PNG, or WebP image.', {
      fields: { screenshot: ['Screenshot must be a JPEG, PNG, or WebP image.'] },
    });
  }

  let screenshotUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${owned.id}-${Date.now()}.${extension}`;
    const result = await mediaHostUpload({ buffer, mimetype: file.type }, filename, 'utr-screenshots');
    screenshotUrl = result.url;
  } catch (error) {
    console.error('[bookings/utr] screenshot upload failed:', error);
    return fail(
      'SERVICE_UNAVAILABLE',
      'Could not upload the screenshot. Check your connection and try again.',
    );
  }

  const result = await transitionBooking({
    bookingId: owned.id,
    to: 'PAYMENT_VERIFICATION',
    allowedFrom: ['PENDING_PAYMENT'],
    actor: { userId: auth.actor.userId, role: auth.actor.role },
    note: 'UTR submitted by customer',
    payment: {
      to: 'VERIFICATION_PENDING',
      utrScreenshotUrl: screenshotUrl,
      ...(utr ? { upiUtr: utr } : {}),
    },
  });

  if (!result.ok) {
    const message = transitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toBooking(result.booking), { headers: { 'Cache-Control': 'no-store' } });
}
