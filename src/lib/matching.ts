import type { Nurse, CareRequest, CareRequestSlot, Availability } from '../types';
import { getDistanceKm, USER_COORDS } from './distance';

export interface VisitPlanSlot {
  slot: CareRequestSlot;
  nurse: Nurse | null;
  distance: number;
  hours: number;
  price: number;
  reason?: string;
}

export interface VisitPlan {
  slots: VisitPlanSlot[];
  totalHours: number;
  totalPrice: number;
  assignedNurses: Nurse[];
  uncoveredSlots: number;
}

// Build a visit plan: assign the best available nurse to each slot
export function buildVisitPlan(
  request: CareRequest,
  nurses: Nurse[],
  availability: Availability[],
  familyPricePerHour: number
): VisitPlan {
  const slots: VisitPlanSlot[] = [];
  const assignedNurseIds = new Set<string>();

  for (const slot of request.slots) {
    const [sh, sm] = slot.start_time.split(':').map(Number);
    const [eh, em] = slot.end_time.split(':').map(Number);
    const hours = (eh + em / 60) - (sh + sm / 60);

    const candidates = nurses
      .filter(n => n.specialization.includes(request.specialization_needed))
      .filter(n => {
        const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, n.lat, n.lng);
        return distance <= n.coverage_radius;
      })
      .filter(n => {
        return availability.some(
          a => a.nurse_id === n.id &&
          a.date === slot.date &&
          a.is_available &&
          a.start_time <= slot.start_time &&
          a.end_time >= slot.end_time
        );
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
        hours: parseFloat(hours.toFixed(1)),
        price: parseFloat((hours * familyPricePerHour).toFixed(0))
      });
    } else {
      slots.push({
        slot,
        nurse: null,
        distance: 0,
        hours: parseFloat(hours.toFixed(1)),
        price: 0,
        reason: 'No hay enfermeras disponibles para esta fecha/hora'
      });
    }
  }

  const totalHours = slots.reduce((sum, s) => sum + s.hours, 0);
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const uncoveredSlots = slots.filter(s => s.nurse === null).length;
  const assignedNurses = Array.from(assignedNurseIds)
    .map(id => nurses.find(n => n.id === id))
    .filter((n): n is Nurse => n !== undefined);

  return {
    slots,
    totalHours: parseFloat(totalHours.toFixed(1)),
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
  familyPricePerHour: number
): VisitPlan {
  const nurseMap = new Map(nurses.map(n => [n.id, n]));
  const slots: VisitPlanSlot[] = [];
  const assignedNurseIds = new Set<string>();

  for (let i = 0; i < request.slots.length; i++) {
    const slot = request.slots[i];
    const [sh, sm] = slot.start_time.split(':').map(Number);
    const [eh, em] = slot.end_time.split(':').map(Number);
    const hours = (eh + em / 60) - (sh + sm / 60);

    // Find accepted offers for this slot
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
        hours: parseFloat(hours.toFixed(1)),
        price: 0,
        reason: 'Ninguna enfermera confirmó esta fecha'
      });
      continue;
    }

    // Pick the best accepted nurse: closest + highest rating
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
        hours: parseFloat(hours.toFixed(1)),
        price: parseFloat((hours * familyPricePerHour).toFixed(0))
      });
    } else {
      slots.push({
        slot,
        nurse: null,
        distance: 0,
        hours: parseFloat(hours.toFixed(1)),
        price: 0,
        reason: 'Ninguna enfermera confirmó esta fecha'
      });
    }
  }

  const totalHours = slots.reduce((sum, s) => sum + s.hours, 0);
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const uncoveredSlots = slots.filter(s => s.nurse === null).length;
  const assignedNurses = Array.from(assignedNurseIds)
    .map(id => nurseMap.get(id))
    .filter((n): n is Nurse => n !== undefined);

  return {
    slots,
    totalHours: parseFloat(totalHours.toFixed(1)),
    totalPrice: parseFloat(totalPrice.toFixed(0)),
    assignedNurses,
    uncoveredSlots
  };
}
