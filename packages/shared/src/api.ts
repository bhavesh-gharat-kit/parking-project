/**
 * The API response envelope.
 *
 * Every route handler under `apps/api/app/api/**` returns one of these two
 * shapes, so the mobile client has exactly one branch to write
 * (`if (!res.ok) ...`) instead of one per endpoint.
 *
 * Phase 01 only defines the contract; `apps/api/lib/http.ts` has the helpers that
 * produce it, and later phases add per-endpoint payload types alongside their
 * Zod input schemas.
 */
import { z } from 'zod';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: {
    /** Stable, machine-readable. Clients branch on this, never on `message`. */
    code: ApiErrorCode;
    /** Human-readable, safe to show to a user. */
    message: string;
    /** Field-level validation detail, keyed by form field path. */
    fields?: Record<string, string[]>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** A booking/payment transition the state machine does not allow (Phase 05). */
  'INVALID_STATE_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);

/** Maps an error code to the HTTP status the API answers with. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/* ─────────────────────────── Health check ──────────────────────────── */

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  /** Reachability of MySQL through Prisma. */
  database: z.enum(['up', 'down']),
  /** Round-trip time of the database probe, in milliseconds. */
  databaseLatencyMs: z.number().nullable(),
  version: z.string(),
  /** `process.env.NODE_ENV` of the running API. */
  environment: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/* ───────────────────────── Pagination (shared) ─────────────────────── */

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
