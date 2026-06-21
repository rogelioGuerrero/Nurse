import type { Nurse, CareRequest, CareRequestSlot, Availability, ShiftType } from '../types';
import { SHIFTS } from '../types';
import { getDistanceKm, USER_COORDS } from './distance';
import { getFamilyPrice } from '../data/standardRates';

export interface VisitPlanSlot {
  slot: CareRequestSlot;
  nurse: Nurse | null;
  distance: number;
  shiftHours: number;
  price: number;
  reason?: string;
}

export interface VisitPlan {
  slots: VisitPlanSlot[];
  totalShifts: number;
  totalPrice: number;
  assignedNurses: Nurse[];
  uncoveredSlots: number;
}

// Build a visit plan: assign the best available nurse to each slot
export function buildVisitPlan(
  request: CareRequest,
  nurses: Nurse[],
  availability: Availability[],
): VisitPlan {
  const slots: VisitPlanSlot[] = [];
  const assignedNurseIds = new Set<string>();
  const familyPrice = getFamilyPrice(request.specialization_needed);

  for (const slot of request.slots) {
    const shiftInfo = SHIFTS[slot.shift as ShiftType];
    const shiftHours = shiftInfo.hours;

    const candidates = nurses
      .filter(n => n.specialization.includes(request.specialization_needed))
      .filter(n => n.available_shifts.includes(slot.shift as ShiftType))
      .filter(n => {
        const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, n.lat, n.lng);
        return distance <= n.coverage_radius;
      })
      .map(n => {
        const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, n.lat, n.lng);
        const assignmentBonus = assignedNurseIds.has(n.id) ? 0.15 : 0;
        const distanceScore = 1 - (distance / n.coverage_radius);
        const ratingScore = n.rating / 5;
        const score = (distanceScore * 0.45) + (ratingScore * 0.4) + assignmentBonus;
        return { nurse: n, distance: parseFloat(distance.toFixed(1)), score };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      assignedNurseIds.add(best.nurse.id);
      slots.push({
        slot,
        nurse: best.nurse,
        distance: best.distance,
        shiftHours,
        price: familyPrice
      });
    } else {
      slots.push({
        slot,
        nurse: null,
        distance: 0,
        shiftHours,
        price: 0,
        reason: 'No hay enfermeras disponibles para este turno'
      });
    }
  }

  const totalShifts = slots.length;
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const uncoveredSlots = slots.filter(s => s.nurse === null).length;
  const assignedNurses = Array.from(assignedNurseIds)
    .map(id => nurses.find(n => n.id === id))
    .filter((n): n is Nurse => n !== undefined);

  return {
    slots,
    totalShifts,
    totalPrice: parseFloat(totalPrice.toFixed(0)),
    assignedNurses,
    uncoveredSlots
  };
}

// Build a final visit plan from accepted offers only (after the response window closes)
export function buildFinalPlanFromOffers(
  request: CareRequest,
  offers: { request_id: string; nurse_id: string; slot_index: number; status: string }[],
  nurses: Nurse[],
): VisitPlan {
  const nurseMap = new Map(nurses.map(n => [n.id, n]));
  const slots: VisitPlanSlot[] = [];
  const assignedNurseIds = new Set<string>();
  const familyPrice = getFamilyPrice(request.specialization_needed);

  for (let i = 0; i < request.slots.length; i++) {
    const slot = request.slots[i];
    const shiftInfo = SHIFTS[slot.shift as ShiftType];
    const shiftHours = shiftInfo.hours;

    const acceptedOffers = offers.filter(
      o => o.request_id === request.id &&
      o.slot_index === i &&
      o.status === 'accepted'
    );

    if (acceptedOffers.length === 0) {
      slots.push({
        slot,
        nurse: null,
        distance: 0,
        shiftHours,
        price: 0,
        reason: 'Ninguna enfermera confirmó este turno'
      });
      continue;
    }

    const candidates = acceptedOffers
      .map(o => {
        const nurse = nurseMap.get(o.nurse_id);
        if (!nurse) return null;
        const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, nurse.lat, nurse.lng);
        const distanceScore = 1 - (distance / nurse.coverage_radius);
        const ratingScore = nurse.rating / 5;
        const assignmentBonus = assignedNurseIds.has(nurse.id) ? 0.15 : 0;
        return { nurse, distance: parseFloat(distance.toFixed(1)), score: distanceScore * 0.45 + ratingScore * 0.4 + assignmentBonus };
      })
      .filter((c): c is { nurse: Nurse; distance: number; score: number } => c !== null)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      assignedNurseIds.add(best.nurse.id);
      slots.push({
        slot,
        nurse: best.nurse,
        distance: best.distance,
        shiftHours,
        price: familyPrice
      });
    } else {
      slots.push({
        slot,
        nurse: null,
        distance: 0,
        shiftHours,
        price: 0,
        reason: 'Ninguna enfermera confirmó este turno'
      });
    }
  }

  const totalShifts = slots.length;
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const uncoveredSlots = slots.filter(s => s.nurse === null).length;
  const assignedNurses = Array.from(assignedNurseIds)
    .map(id => nurseMap.get(id))
    .filter((n): n is Nurse => n !== undefined);

  return {
    slots,
    totalShifts,
    totalPrice: parseFloat(totalPrice.toFixed(0)),
    assignedNurses,
    uncoveredSlots
  };
}
