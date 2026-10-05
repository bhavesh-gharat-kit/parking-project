/**
 * `GET /api/passes/:id/document` — the printable pass (`_/decisions.md` D5,
 * Phase 22). Mirrors `receipts.ts`'s shape: a separate DTO from `PassBooking`
 * rather than a few extra fields on it, since this only ever exists once a
 * pass is `CONFIRMED` and carries nothing the other pass screens need on
 * every fetch.
 *
 * Deliberately narrow — only the fields `pass-photo.jpeg`'s 14-field grid
 * (page 1) actually renders. `planLabel`/`amountInPaise`/location are not
 * part of that paper form, so they are not here either.
 */
import { z } from 'zod';

import { PaymentMethodSchema } from './enums';
import {
  PassBookingStatusSchema,
  PassEntrySideSchema,
  PassHolidayOffDaySchema,
  PassOccupationCategorySchema,
  PassSpecificationSchema,
  PassVehicleCategorySchema,
  ShiftTypeSchema,
  type PassBookingStatus,
} from './passes';

/** Only a `CONFIRMED` pass has a complete document to print (D5 point 6 —
 *  `specification`/`entrySide` are admin-set at approval time). */
export const PASS_DOCUMENT_ELIGIBLE_STATUSES = ['CONFIRMED'] as const satisfies readonly PassBookingStatus[];

export function isPassDocumentEligible(status: PassBookingStatus): boolean {
  return (PASS_DOCUMENT_ELIGIBLE_STATUSES as readonly PassBookingStatus[]).includes(status);
}

export const PassDocumentSchema = z.object({
  passId: z.string(),
  /** Printed in the पावती क्रमांक box. */
  passNumber: z.string(),
  status: PassBookingStatusSchema,
  /** For the header's दिनांक box — when the application was made. */
  createdAt: z.string(),

  vehicleNumber: z.string(),
  /** Field 4 वाहन प्रकार — which icon gets ticked. */
  vehicleCategory: PassVehicleCategorySchema,
  /** Field 1's दिवस/रात्र icons. */
  shiftType: ShiftTypeSchema,

  mobileNumber: z.string(),
  address: z.string(),

  /** Field 5 वर्गीकरण — `null` until an admin sets it (D5 point 6); the
   *  document simply leaves the row unticked rather than inventing a value. */
  specification: PassSpecificationSchema.nullable(),
  /** Field 12 प्रवेश मार्ग — `null` until an admin sets it. */
  entrySide: PassEntrySideSchema.nullable(),

  /** Field 13 व्यवसाय. `OTHER` pairs with `occupationOther`'s free text. */
  occupationCategory: PassOccupationCategorySchema.nullable(),
  occupationOther: z.string().nullable(),
  /** Field 8's सुट्टीचे दिवस checkboxes. `OTHER` pairs with `holidayOffDayOther`. */
  holidayOffDay: PassHolidayOffDaySchema.nullable(),
  holidayOffDayOther: z.string().nullable(),
  /** Field 11 सुविधा checkboxes. */
  helmet: z.boolean(),
  locker: z.boolean(),
  airCheck: z.boolean(),
  rickshawParking: z.boolean(),
  /** Field 9's जुना पास tick + खेप box. */
  renewalReference: z.string().nullable(),
  /** Field 8's "महिन्यातून एकूण ___ दिवस पार्किंग" blank. */
  expectedParkingDays: z.number().nullable(),
  /** Field 2's येण्याची वेळ / जाण्याची वेळ blanks, `"HH:MM"`. */
  entryTime: z.string().nullable(),
  exitTime: z.string().nullable(),

  /** Field 10 पास दिनांक / वैधता. */
  startDate: z.string(),
  endDate: z.string(),

  /** Field 3 पेमेंट पद्धत. */
  paymentMethod: PaymentMethodSchema.nullable(),
  /** Field 14 स्टिकर क्रमांक — `PassPayment.upiUtr` (D5 point 7): present for
   *  a UPI-paid pass, `null` (left blank) for a cash-paid one. */
  upiUtr: z.string().nullable(),
});
export type PassDocument = z.infer<typeof PassDocumentSchema>;
