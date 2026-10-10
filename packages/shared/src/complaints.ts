/**
 * Complaint contracts. A user files a complaint with either a `categoryId`
 * (one of the admin-managed common issue titles) or, for "Other", a
 * `customTitle` — exactly one of the two. Images are optional and travel as
 * multipart files, so they are validated server-side, not in these schemas.
 */
import { z } from 'zod';

import { ComplaintStatusSchema } from './enums';
import { PaginationQuerySchema } from './api';

export const COMPLAINT_MAX_IMAGES = 3;
export const COMPLAINT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPLAINT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Sentinel the form sends for `categoryId` when the user picks "Other". */
export const COMPLAINT_OTHER_CATEGORY = 'OTHER';

/** `POST /api/complaints` (the text fields of the multipart body). */
export const ComplaintCreateRequestSchema = z
  .object({
    categoryId: z.string().trim().min(1, 'Choose an issue'),
    customTitle: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(3, 'Enter at least 3 characters').max(120, 'Keep it under 120 characters').optional(),
    ),
    description: z
      .string()
      .trim()
      .min(10, 'Describe the issue in at least 10 characters')
      .max(1000, 'Keep it under 1000 characters'),
  })
  .superRefine((value, ctx) => {
    if (value.categoryId === COMPLAINT_OTHER_CATEGORY && !value.customTitle) {
      ctx.addIssue({ code: 'custom', path: ['customTitle'], message: 'Enter a title for your issue' });
    }
  });
export type ComplaintCreateRequest = z.input<typeof ComplaintCreateRequestSchema>;
export type ComplaintCreateRequestParsed = z.output<typeof ComplaintCreateRequestSchema>;

/** `PATCH /api/admin/complaints/:id`. */
export const ComplaintAdminUpdateRequestSchema = z.object({
  status: ComplaintStatusSchema,
  resolutionNote: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(1000, 'Keep it under 1000 characters').optional(),
  ),
});
export type ComplaintAdminUpdateRequest = z.input<typeof ComplaintAdminUpdateRequestSchema>;

/** `GET /api/admin/complaints`. */
export const AdminComplaintListQuerySchema = PaginationQuerySchema.extend({
  status: ComplaintStatusSchema.optional(),
  categoryId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});
export type AdminComplaintListQuery = z.output<typeof AdminComplaintListQuerySchema>;

/** `POST /api/admin/complaint-categories`, `PATCH .../:id`. */
export const ComplaintCategoryRequestSchema = z.object({
  title: z.string().trim().min(3, 'Enter at least 3 characters').max(120, 'Keep it under 120 characters'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type ComplaintCategoryRequest = z.input<typeof ComplaintCategoryRequestSchema>;

export type ComplaintCategory = {
  id: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
};

export type ComplaintEvent = {
  id: string;
  fromStatus: z.infer<typeof ComplaintStatusSchema> | null;
  toStatus: z.infer<typeof ComplaintStatusSchema>;
  note: string | null;
  createdAt: string;
};

export type Complaint = {
  id: string;
  /** Display reference, e.g. "C-0042". */
  ticket: string;
  title: string;
  description: string;
  status: z.infer<typeof ComplaintStatusSchema>;
  resolutionNote: string | null;
  resolvedAt: string | null;
  imageUrls: string[];
  events: ComplaintEvent[];
  createdAt: string;
  updatedAt: string;
};

export type AdminComplaint = Complaint & {
  categoryId: string | null;
  user: { id: string; name: string | null; email: string; phone: string | null };
};
