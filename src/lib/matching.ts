import type { Nurse, CareRequest, CareRequestSlot, Availability, ShiftType } from '../types';
import { SHIFTS } from '../types';
import { getDistanceKm, USER_COORDS } from './distance';
import { calculateFamilyPrice } from '../data/standardRates';

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

interface ScoredNurse {
  nurse: Nurse;
  distance: number;
  score: number;
}

// Score a nurse by distance, rating, and assignment bonus (shared by both plan builders)
function scoreNurse(
  nurse: Nurse,
  originLat: number,
  originLng: number,
  assignedNurseIds: Set<string>,
): ScoredNurse {
  const distance = getDistanceKm(originLat, originLng, nurse.lat, nurse.lng);
  const distanceScore = 1 - (distance / nurse.coverage_radius);
  const ratingScore = nurse.rating / 5;
  const assignmentBonus = assignedNurseIds.has(nurse.id) ? 0.15 : 0;
  const score = (distanceScore * 0.45) + (ratingScore * 0.4) + assignmentBonus;
  return { nurse, distance: parseFloat(distance.toFixed(1)), score };
}

// Build a covered slot (nurse assigned)
function buildCoveredSlot(slot: CareRequestSlot, nurse: Nurse, distance: number, wantsInvoice: boolean): VisitPlanSlot {
  return {
    slot,
    nurse,
    distance,
    shiftHours: 0,
    price: calculateFamilyPrice(nurse.shift_rate, wantsInvoice),
  };
}

// Build an uncovered slot (no nurse)
function buildUncoveredSlot(slot: CareRequestSlot, reason: string): VisitPlanSlot {
  return { slot, nurse: null, distance: 0, shiftHours: 0, price: 0, reason };
}

// Assemble the final VisitPlan from slots and assigned nurse IDs
function assemblePlan(
  slots: VisitPlanSlot[],
  assignedNurseIds: Set<string>,
  nurseLookup: (id: string) => Nurse | undefined,
): VisitPlan {
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const uncoveredSlots = slots.filter(s => s.nurse === null).length;
  const assignedNurses = Array.from(assignedNurseIds)
    .map(nurseLookup)
    .filter((n): n is Nurse => n !== undefined);

  return {
    slots,
    totalShifts: slots.length,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    assignedNurses,
    uncoveredSlots,
  };
}

// Build a visit plan: assign the best available nurse to each slot
export function buildVisitPlan(
  request: CareRequest,
  nurses: Nurse[],
  availability: Availability[],
): VisitPlan {
  const slots: VisitPlanSlot[] = [];
  const assignedNurseIds = new Set<string>();
  const originLat = request.lat ?? USER_COORDS.lat;
  const originLng = request.lng ?? USER_COORDS.lng;

  for (const slot of request.slots) {
    const candidates = nurses
      .filter(n => n.specialization.includes(request.specialization_needed))
      .filter(n => n.available_shifts.includes(slot.shift as ShiftType))
      .filter(n => {
        const distance = getDistanceKm(originLat, originLng, n.lat, n.lng);
        return distance <= n.coverage_radius;
      })
      .map(n => scoreNurse(n, originLat, originLng, assignedNurseIds))
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      assignedNurseIds.add(best.nurse.id);
      slots.push(buildCoveredSlot(slot, best.nurse, best.distance, request.wants_invoice));
    } else {
      slots.push(buildUncoveredSlot(slot, 'No hay enfermeras disponibles para este turno'));
    }
  }

  return assemblePlan(slots, assignedNurseIds, id => nurses.find(n => n.id === id));
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
  const originLat = request.lat ?? USER_COORDS.lat;
  const originLng = request.lng ?? USER_COORDS.lng;

  for (let i = 0; i < request.slots.length; i++) {
    const slot = request.slots[i];

    const acceptedOffers = offers.filter(
      o => o.request_id === request.id &&
      o.slot_index === i &&
      o.status === 'accepted'
    );

    if (acceptedOffers.length === 0) {
      slots.push(buildUncoveredSlot(slot, 'Ninguna enfermera confirmó este turno'));
      continue;
    }

    const candidates = acceptedOffers
      .map(o => {
        const nurse = nurseMap.get(o.nurse_id);
        if (!nurse) return null;
        return scoreNurse(nurse, originLat, originLng, assignedNurseIds);
      })
      .filter((c): c is ScoredNurse => c !== null)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      assignedNurseIds.add(best.nurse.id);
      slots.push(buildCoveredSlot(slot, best.nurse, best.distance, request.wants_invoice));
    } else {
      slots.push(buildUncoveredSlot(slot, 'Ninguna enfermera confirmó este turno'));
    }
  }

  return assemblePlan(slots, assignedNurseIds, id => nurseMap.get(id));
}
