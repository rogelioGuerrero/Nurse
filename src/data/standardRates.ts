export interface StandardRate {
  specialization: string;
  familyPrice: number; // what the family pays per 8-hour shift
  nursePayout: number; // what the nurse receives per shift
  commission: number; // platform commission per shift
}

// Standard rates by specialization - per 8-hour shift (not per hour)
export const STANDARD_RATES: StandardRate[] = [
  { specialization: 'Geriatría', familyPrice: 25, nursePayout: 20, commission: 5 },
  { specialization: 'Demencia y Alzheimer', familyPrice: 28, nursePayout: 23, commission: 5 },
  { specialization: 'Postoperatorio', familyPrice: 30, nursePayout: 25, commission: 5 },
  { specialization: 'Cuidados Paliativos', familyPrice: 35, nursePayout: 28, commission: 7 },
  { specialization: 'Curaciones complejas', familyPrice: 27, nursePayout: 22, commission: 5 },
  { specialization: 'Fisioterapia Básica', familyPrice: 22, nursePayout: 18, commission: 4 },
  { specialization: 'Inyecciones', familyPrice: 20, nursePayout: 16, commission: 4 },
  { specialization: 'Manejo de Sondas', familyPrice: 27, nursePayout: 22, commission: 5 },
  { specialization: 'Monitoreo Cardíaco', familyPrice: 32, nursePayout: 26, commission: 6 },
  { specialization: 'Control de Diabetes', familyPrice: 22, nursePayout: 18, commission: 4 },
  { specialization: 'Nutrición asistida', familyPrice: 20, nursePayout: 16, commission: 4 },
  { specialization: 'Cuidado general', familyPrice: 20, nursePayout: 16, commission: 4 },
];

const rateMap = new Map<string, StandardRate>(
  STANDARD_RATES.map(r => [r.specialization, r])
);

export function getRate(specialization: string): StandardRate {
  return rateMap.get(specialization) ?? STANDARD_RATES[STANDARD_RATES.length - 1];
}

export function getFamilyPrice(specialization: string): number {
  return getRate(specialization).familyPrice;
}

export function getNursePayout(specialization: string): number {
  return getRate(specialization).nursePayout;
}

export function calculateShiftPrice(specialization: string, shiftCount: number = 1): number {
  return getFamilyPrice(specialization) * shiftCount;
}

export function getAllSpecializations(): string[] {
  return STANDARD_RATES.map(r => r.specialization);
}
