/**
 * Plain field-level edits to an already-created `PassBooking` (`_/decisions.md`
 * D5 point 8, Phase 21). The admin-side counterpart to `transitions.ts`: that
 * file is the only place `PassBooking.status`/`PassPayment.status` is
 * written; this is the only place every OTHER `PassBooking` column changes
 * after creation — `startDate`/`endDate` included, as a plain manual
 * override with no recomputation of anything else (D5 point 8's own words).
 * `status` and `paymentMethod` are deliberately absent from `PassFieldEdit`:
 * those carry money-side consequences that belong to the approve/reject/
 * payment-method endpoints, never to a plain write here.
 *
 * Writes one `PassStatusEvent` row per call, same audit trail
 * `transitionPassBooking` writes for a status move, but with `fromStatus`/
 * `toStatus` both `null` — this is never a status transition — and
 * `changedFields` carrying the before/after diff instead.
 */
import type { Prisma } from '@/generated/prisma/client';
import type {
  PassEntrySide,
  PassSpecification,
  PassVehicleCategory,
  ShiftType,
  UserRole,
  VehicleType,
} from '@parking/shared';

import { prisma } from '@/lib/db';
import { PASS_ADMIN_RELATIONS, type AdminPassBookingWithRelations } from './projection';

/**
 * Exactly the columns `AdminPassEditRequestSchema` accepts. `null` on a
 * nullable field is a deliberate clear, `undefined`/absent means "leave it".
 */
export type PassFieldEdit = {
  vehicleNumber?: string;
  vehicleType?: VehicleType;
  vehicleCategory?: PassVehicleCategory;
  mobileNumber?: string;
  address?: string;
  occupationCategory?: string | null;
  holidayOffDay?: string | null;
  helmet?: boolean;
  locker?: boolean;
  airCheck?: boolean;
  rickshawParking?: boolean;
  renewalReference?: string | null;
  specification?: PassSpecification | null;
  entrySide?: PassEntrySide | null;
  planLabel?: string;
  shiftType?: ShiftType;
  validityMonths?: number;
  amountInPaise?: number;
  /** Already expanded to an exact IST instant by the route handler
   *  (`istDayBounds`) — see that file's header for why. */
  startDate?: Date;
  endDate?: Date;
};

const EDITABLE_FIELDS = [
  'vehicleNumber',
  'vehicleType',
  'vehicleCategory',
  'mobileNumber',
  'address',
  'occupationCategory',
  'holidayOffDay',
  'helmet',
  'locker',
  'airCheck',
  'rickshawParking',
  'renewalReference',
  'specification',
  'entrySide',
  'planLabel',
  'shiftType',
  'validityMonths',
  'amountInPaise',
  'startDate',
  'endDate',
] as const satisfies readonly (keyof PassFieldEdit)[];

export type ChangedFields = Record<string, { from: unknown; to: unknown }>;

export type EditPassBookingInput = {
  passBookingId: string;
  edit: PassFieldEdit;
  note: string;
  actor: { userId: string; role: UserRole };
};

export type EditPassBookingResult =
  | { ok: true; passBooking: AdminPassBookingWithRelations; changedFields: ChangedFields }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NO_CHANGES' };

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Applies `edit` to `passBookingId`, writing and diffing only the fields
 * whose value actually differs from what is already stored — a field
 * present in `edit` but equal to the current value contributes nothing to
 * `changedFields` and is not part of the update statement, so a no-op PATCH
 * never bumps `updatedAt` or writes a hollow audit row.
 */
export async function editPassBooking(input: EditPassBookingInput): Promise<EditPassBookingResult> {
  const { passBookingId, edit, note, actor } = input;

  return prisma.$transaction(async (tx) => {
    const current = await tx.passBooking.findUnique({ where: { id: passBookingId } });
    if (!current) return { ok: false, reason: 'NOT_FOUND' } as const;

    const currentRecord = current as unknown as Record<string, unknown>;
    const editRecord = edit as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    const changedFields: ChangedFields = {};

    for (const field of EDITABLE_FIELDS) {
      if (!(field in editRecord) || editRecord[field] === undefined) continue;

      const to = serialize(editRecord[field]);
      const from = serialize(currentRecord[field]);
      if (from === to) continue;

      data[field] = editRecord[field];
      changedFields[field] = { from, to };
    }

    if (Object.keys(changedFields).length === 0) {
      return { ok: false, reason: 'NO_CHANGES' } as const;
    }

    await tx.passBooking.update({
      where: { id: passBookingId },
      data: data as Prisma.PassBookingUncheckedUpdateInput,
    });

    await tx.passStatusEvent.create({
      data: {
        passBookingId,
        fromStatus: null,
        toStatus: null,
        actorId: actor.userId,
        actorRole: actor.role,
        note,
        changedFields: changedFields as unknown as Prisma.InputJsonValue,
      },
    });

    const passBooking = await tx.passBooking.findUniqueOrThrow({
      where: { id: passBookingId },
      include: PASS_ADMIN_RELATIONS,
    });

    return { ok: true, passBooking, changedFields } as const;
  });
}

export function editPassBookingFailureMessage(
  failure: Extract<EditPassBookingResult, { ok: false }>,
): string {
  switch (failure.reason) {
    case 'NOT_FOUND':
      return 'That pass application could not be found.';
    case 'NO_CHANGES':
      return 'Nothing changed — adjust a field before saving.';
  }
}
