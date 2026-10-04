'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type ShiftType,
  type VehicleType,
} from '@parking/shared';

// "Other" has no shift/price tiers in the pass plan matrix (D5 point 2 —
// the matrix is vehicle type × shift type); daily packages offer it but
// passes don't need to.
const PASS_VEHICLE_TYPES = VEHICLE_TYPES.filter((type) => type !== 'OTHER');

export default function NewPassVehicleShiftPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const router = useRouter();

  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [shiftType, setShiftType] = useState<ShiftType | null>(null);

  const continueToPlans = () => {
    if (!vehicleType || !shiftType) return;
    router.push(
      `/web/customer/passes/new/${locationId}/plan?vehicleType=${vehicleType}&shiftType=${shiftType}`,
    );
  };

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Vehicle &amp; shift</h1>
      <p className="text-small text-secondary">Pass plans are priced per vehicle type and shift.</p>

      <div className="field">
        <span className="field-label">Vehicle type</span>
        <div className="chip-row">
          {PASS_VEHICLE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`chip${vehicleType === type ? ' selected' : ''}`}
              onClick={() => setVehicleType(type)}
            >
              {VEHICLE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Shift</span>
        <div className="chip-row">
          {SHIFT_TYPES.map((shift) => (
            <button
              key={shift}
              type="button"
              className={`chip${shiftType === shift ? ' selected' : ''}`}
              onClick={() => setShiftType(shift)}
            >
              {SHIFT_TYPE_LABELS[shift]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!vehicleType || !shiftType}
        onClick={continueToPlans}
      >
        Continue
      </button>
    </div>
  );
}
