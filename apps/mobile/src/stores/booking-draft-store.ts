/**
 * The in-progress booking a customer is assembling — scaffold only.
 *
 * The booking flow spans several screens (location → vehicle → package →
 * summary → payment, context.txt §9), so the partial selection has to live
 * somewhere other than route params: the customer can go back, change the
 * vehicle, and the package list has to re-filter.
 *
 * What it deliberately does NOT hold is an amount. The backend derives the price
 * from `ParkingRate` (context.txt §32) — a price kept here would be a
 * client-side number tempting someone to submit it. The summary screen displays
 * the amount the *server* returned for the chosen rate.
 *
 * Phase 04/05 fill in the real fields and actions.
 */
import { create } from 'zustand';

import type { PaymentMethod, VehicleType } from '@parking/shared';

type BookingDraft = {
  locationId: string | null;
  vehicleId: string | null;
  vehicleType: VehicleType | null;
  rateId: string | null;
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
    // Changing location invalidates the package: rates are per location.
    set({ locationId, rateId: null }),

  setVehicle: (vehicleId, vehicleType) =>
    // Changing vehicle type invalidates the package: rates are per vehicle type.
    set({ vehicleId, vehicleType, rateId: null }),

  setRate: (rateId) => set({ rateId }),

  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

  reset: () => set(EMPTY_DRAFT),
}));
