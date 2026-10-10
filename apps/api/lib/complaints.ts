/**
 * Complaint projections and the status rules. Kept out of the route handlers so
 * the user and admin endpoints answer with the same shapes.
 */
import type { Prisma } from '@/generated/prisma/client';
import type { AdminComplaint, Complaint, ComplaintCategory, ComplaintStatus } from '@parking/shared';

/** What an admin may move a complaint to, from each status. RESOLVED/REJECTED are final. */
export const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

export const complaintInclude = {
  images: { orderBy: { sortOrder: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  user: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.ComplaintInclude;

export type ComplaintRow = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }>;

export function formatTicket(ticketNo: number): string {
  return `C-${String(ticketNo).padStart(4, '0')}`;
}

export function toComplaint(row: ComplaintRow): Complaint {
  return {
    id: row.id,
    ticket: formatTicket(row.ticketNo),
    title: row.title,
    description: row.description,
    status: row.status,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    imageUrls: row.images.map((image) => image.url),
    events: row.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminComplaint(row: ComplaintRow): AdminComplaint {
  return { ...toComplaint(row), categoryId: row.categoryId, user: row.user };
}

export function toComplaintCategory(row: {
  id: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
}): ComplaintCategory {
  return { id: row.id, title: row.title, sortOrder: row.sortOrder, isActive: row.isActive };
}

