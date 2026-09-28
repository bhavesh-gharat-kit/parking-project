/**
 * The in-progress booking a customer is assembling (context.txt §9).
 *
 * The flow spans four screens — location → vehicle → package → summary — so the
 * partial selection cannot live in route params: the customer can go back and
 * change the vehicle, and the package list then has to re-filter to that
 * vehicle's type.
 *
 * ── What it deliberately does NOT hold ─────────────────────────────────────
 * An amount. The backend derives the price from `ParkingRate` (context.txt §32),
 * and a price cached here would be a client-side number tempting a future screen
 * to submit it. The summary screen renders `amountInPaise` from the booking the
 * *server* created. The `rateId` is a reference to a price, not a price.
 *
 * ── Why the invalidation cascade matters ───────────────────────────────────
 * Rates are per (location, vehicle type), so a stale `rateId` after changing
 * either one would be a package priced for something else — which the backend
 * rejects (`RATE_VEHICLE_MISMATCH`), but as a confusing error rather than a
 * re-pick. Clearing it in the setter means the flow cannot reach the summary in
 * that state at all.
 */
import { create } from 'zustand';

import type { PaymentMethod, VehicleType } from '@parking/shared';

type BookingDraft = {
  locationId: string | null;
  vehicleId: string | null;
  /** The chosen vehicle's own type — what the package list filters on. */
  vehicleType: VehicleType | null;
  rateId: string | null;
  /** Phase 06 — chosen after the summary, on the payment method screen. */
  paymentMethod: PaymentMethod | null;
};

const EMPTY_DRAFT: BookingDraft = {
  locationId: null,
  vehicleId: null,
  vehicleType: null,
  rateId: null,
  paymentMethod: null,
};

type BookingDraftState = BookingDraft & {
  setLocation: (locationId: string) => void;
  setVehicle: (vehicleId: string, vehicleType: VehicleType) => void;
  setRate: (rateId: string) => void;
  setPaymentMethod: (paymentMethod: PaymentMethod) => void;
  reset: () => void;
};

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  ...EMPTY_DRAFT,

  setLocation: (locationId) =>
    // Changing location invalidates both later choices: rates are per location,
    // and the vehicle picker is re-entered from here anyway.
    set({ locationId, rateId: null }),

  setVehicle: (vehicleId, vehicleType) =>
    // Changing vehicle type invalidates the package: rates are per vehicle type.
    set({ vehicleId, vehicleType, rateId: null }),

  setRate: (rateId) => set({ rateId }),

  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

  // Called once the booking exists on the server: from there on the booking id
  // is the state, and a leftover draft would only let a stale selection be
  // resubmitted.
  reset: () => set(EMPTY_DRAFT),
}));
