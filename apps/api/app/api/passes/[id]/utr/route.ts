/**
 * POST /api/passes/:id/utr — the customer submits proof of UPI payment for a
 * pass application after paying the QR. Mirrors
 * `app/api/bookings/[id]/utr/route.ts` exactly, retargeted at
 * `PassBooking`/`PassPayment`.
 *
 * Never marks the payment `PAID` — only an admin approving it (Phase 21) can
 * move either further. Screenshot required, UTR optional, same as the
 * booking flow (Phase 16's rule, reused here as-is per the Phase 20 brief).
 */
import type { NextRequest } from 'next/server';

import { BookingUtrSubmitRequestSchema } from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { toPassBooking } from '@/lib/passes/projection';
import { passTransitionFailureMessage, transitionPassBooking } from '@/lib/passes/transitions';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';
import { uploadFile } from '@/lib/upload';
import { UTR_SCREENSHOT_RULES } from '@/lib/upload/storageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const SCREENSHOT_REQUIRED_MESSAGE = 'Attach a screenshot of your payment confirmation.';

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const owned = await prisma.passBooking.findFirst({
    where: { id, userId: auth.actor.userId },
    select: { id: true },
  });
  if (!owned) return fail('NOT_FOUND', 'That pass application could not be found.');

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
    const result = await uploadFile({ buffer, mimetype: file.type }, filename, 'pass-utr-screenshots');
    screenshotUrl = result.url;
  } catch (error) {
    console.error('[passes/utr] screenshot upload failed:', error);
    return fail(
      'SERVICE_UNAVAILABLE',
      'Could not upload the screenshot. Check your connection and try again.',
    );
  }

  const result = await transitionPassBooking({
    passBookingId: owned.id,
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
    const message = passTransitionFailureMessage(result);
    if (result.reason === 'NOT_FOUND') return fail('NOT_FOUND', message);
    if (result.reason === 'NO_PAYMENT') return fail('CONFLICT', message);
    return fail('INVALID_STATE_TRANSITION', message);
  }

  return ok(toPassBooking(result.passBooking), { headers: { 'Cache-Control': 'no-store' } });
}
