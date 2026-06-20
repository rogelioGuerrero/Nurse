export interface StandardRate {
  specialization: string;
  familyPrice: number; // what the family pays per hour
  nursePayout: number; // what the nurse receives per hour
  commission: number; // platform commission per hour
}

// Standard rates by specialization - platform-controlled pricing
// Prevents price wars between nurses and ensures consistent pricing for families
export const STANDARD_RATES: StandardRate[] = [
  { specialization: 'Geriatría', familyPrice: 15, nursePayout: 12, commission: 3 },
  { specialization: 'Demencia y Alzheimer', familyPrice: 17, nursePayout: 13, commission: 4 },
  { specialization: 'Postoperatorio', familyPrice: 18, nursePayout: 14, commission: 4 },
  { specialization: 'Cuidados Paliativos', familyPrice: 20, nursePayout: 16, commission: 4 },
  { specialization: 'Curaciones complejas', familyPrice: 16, nursePayout: 12, commission: 4 },
  { specialization: 'Fisioterapia Básica', familyPrice: 14, nursePayout: 11, commission: 3 },
  { specialization: 'Inyecciones', familyPrice: 12, nursePayout: 10, commission: 2 },
  { specialization: 'Manejo de Sondas', familyPrice: 16, nursePayout: 13, commission: 3 },
  { specialization: 'Monitoreo Cardíaco', familyPrice: 18, nursePayout: 14, commission: 4 },
  { specialization: 'Control de Diabetes', familyPrice: 14, nursePayout: 11, commission: 3 },
  { specialization: 'Nutrición asistida', familyPrice: 13, nursePayout: 10, commission: 3 },
  { specialization: 'Cuidado general', familyPrice: 12, nursePayout: 10, commission: 2 },
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

export function calculateSlotPrice(specialization: string, hours: number): number {
  return getFamilyPrice(specialization) * hours;
}

export function getAllSpecializations(): string[] {
  return STANDARD_RATES.map(r => r.specialization);
}
