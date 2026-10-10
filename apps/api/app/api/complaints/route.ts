/**
 * GET/POST /api/complaints — the signed-in user's own complaints.
 *
 * Always scoped to `auth.actor.userId`. POST is `multipart/form-data`: text
 * fields (`categoryId`, `customTitle`, `description`) plus up to
 * `COMPLAINT_IMAGE_RULES.maxCount` optional `images` files. Images are uploaded
 * before the rows are written, and a failed upload fails the whole request, so a
 * complaint never lands with the evidence the user attached silently missing.
 */
import type { NextRequest } from 'next/server';

import {
  COMPLAINT_OTHER_CATEGORY,
  ComplaintCreateRequestSchema,
  PaginationQuerySchema,
  type Complaint,
  type Paginated,
} from '@parking/shared';

import { requireUser } from '@/lib/auth/guard';
import { complaintInclude, formatTicket, toComplaint } from '@/lib/complaints';
import { prisma } from '@/lib/db';
import { fail, failValidation, ok } from '@/lib/http';
import { sendComplaintPushToAdmins } from '@/lib/push/send';
import { uploadFile } from '@/lib/upload';
import { COMPLAINT_IMAGE_RULES } from '@/lib/upload/storageConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cheap abuse guard — no rate-limit infrastructure exists, so count recent rows. */
const MAX_COMPLAINTS_PER_HOUR = 5;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const query = PaginationQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return failValidation(query.error);
  const { page, pageSize } = query.data;

  const where = { userId: auth.actor.userId };
  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      include: complaintInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.complaint.count({ where }),
  ]);

  const payload: Paginated<Complaint> = {
    items: rows.map(toComplaint),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
  return ok(payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return fail('BAD_REQUEST', 'Expected a multipart form body.');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('BAD_REQUEST', 'Expected a multipart form body.');
  }

  const parsed = ComplaintCreateRequestSchema.safeParse({
    categoryId: form.get('categoryId') ?? '',
    customTitle: form.get('customTitle') ?? undefined,
    description: form.get('description') ?? '',
  });
  if (!parsed.success) return failValidation(parsed.error);
  const { categoryId, customTitle, description } = parsed.data;

  // ── Images (optional) ───────────────────────────────────────────────────
  const files = form.getAll('images').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const imageError = (message: string) => fail('VALIDATION_ERROR', message, { fields: { images: [message] } });

  if (files.length > COMPLAINT_IMAGE_RULES.maxCount) {
    return imageError(`Attach at most ${COMPLAINT_IMAGE_RULES.maxCount} images.`);
  }
  for (const file of files) {
    if (file.size > COMPLAINT_IMAGE_RULES.maxSizeBytes) return imageError('Each image must be 5 MB or smaller.');
    if (!COMPLAINT_IMAGE_RULES.allowedMimeTypes.includes(file.type)) {
      return imageError('Images must be JPEG, PNG, or WebP.');
    }
  }

  // ── Title: a category's, or the user's own for "Other" ──────────────────
  let title: string;
  let resolvedCategoryId: string | null = null;
  if (categoryId === COMPLAINT_OTHER_CATEGORY) {
    title = customTitle!; // guaranteed by the schema's superRefine
  } else {
    const category = await prisma.complaintCategory.findFirst({
      where: { id: categoryId, isActive: true },
      select: { id: true, title: true },
    });
    if (!category) {
      return fail('VALIDATION_ERROR', 'Choose a valid issue.', { fields: { categoryId: ['Choose a valid issue.'] } });
    }
    title = category.title;
    resolvedCategoryId = category.id;
  }

  const recent = await prisma.complaint.count({
    where: { userId: auth.actor.userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_COMPLAINTS_PER_HOUR) {
    return fail('RATE_LIMITED', 'You have raised several complaints recently. Please try again in a while.');
  }

  let imageUrls: string[];
  try {
    imageUrls = await Promise.all(
      files.map(async (file, index) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const extension = file.name.split('.').pop() || 'jpg';
        const filename = `${auth.actor.userId}-${Date.now()}-${index}.${extension}`;
        const result = await uploadFile({ buffer, mimetype: file.type }, filename, 'complaints');
        return result.url;
      }),
    );
  } catch (error) {
    console.error('[complaints] image upload failed:', error);
    return fail('SERVICE_UNAVAILABLE', 'Could not upload the images. Check your connection and try again.');
  }

  const created = await prisma.complaint.create({
    data: {
      userId: auth.actor.userId,
      categoryId: resolvedCategoryId,
      customTitle: resolvedCategoryId ? null : title,
      title,
      description,
      images: { create: imageUrls.map((url, sortOrder) => ({ url, sortOrder })) },
      events: {
        create: { toStatus: 'OPEN', actorId: auth.actor.userId, actorRole: auth.actor.role, note: 'Complaint raised' },
      },
    },
    include: complaintInclude,
  });

  void sendComplaintPushToAdmins({
    title: 'New complaint',
    body: `${formatTicket(created.ticketNo)}: ${title}`,
    complaintId: created.id,
  });

  return ok(toComplaint(created), { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
