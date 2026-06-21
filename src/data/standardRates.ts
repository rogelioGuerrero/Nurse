export interface StandardRate {
  specialization: string;
  suggestedRate: number; // suggested nurse rate per 8-hour shift
}

export const PLATFORM_COMMISSION = 5; // fixed $5 per shift when invoicing
export const IVA_RATE = 0.13; // 13% IVA El Salvador
export const RETENTION_RATE = 0.10; // 10% retencion de renta
export const STRIPE_RATE = 0.035; // ~3.5% Stripe card fee

// Suggested rates by specialization - per 8-hour shift
export const STANDARD_RATES: StandardRate[] = [
  { specialization: 'Geriatría', suggestedRate: 25 },
  { specialization: 'Demencia y Alzheimer', suggestedRate: 28 },
  { specialization: 'Postoperatorio', suggestedRate: 30 },
  { specialization: 'Cuidados Paliativos', suggestedRate: 35 },
  { specialization: 'Curaciones complejas', suggestedRate: 27 },
  { specialization: 'Fisioterapia Básica', suggestedRate: 22 },
  { specialization: 'Inyecciones', suggestedRate: 20 },
  { specialization: 'Manejo de Sondas', suggestedRate: 27 },
  { specialization: 'Monitoreo Cardíaco', suggestedRate: 32 },
  { specialization: 'Control de Diabetes', suggestedRate: 22 },
  { specialization: 'Nutrición asistida', suggestedRate: 20 },
  { specialization: 'Cuidado general', suggestedRate: 20 },
];

const rateMap = new Map<string, StandardRate>(
  STANDARD_RATES.map(r => [r.specialization, r])
);

export function getRate(specialization: string): StandardRate {
  return rateMap.get(specialization) ?? STANDARD_RATES[STANDARD_RATES.length - 1];
}

export function getSuggestedRate(specialization: string): number {
  return getRate(specialization).suggestedRate;
}

// What the family pays total per shift
export function calculateFamilyPrice(nurseRate: number, wantsInvoicing: boolean): number {
  if (!wantsInvoicing) return nurseRate;
  const withRetention = nurseRate / (1 - RETENTION_RATE);
  const withIVA = withRetention * (1 + IVA_RATE);
  return withIVA + PLATFORM_COMMISSION;
}

// What the nurse receives net per shift
export function calculateNurseNet(nurseRate: number, wantsInvoicing: boolean): number {
  if (!wantsInvoicing) return nurseRate;
  return nurseRate * (1 - RETENTION_RATE);
}

// What BienCuidar keeps per shift
export function calculatePlatformRevenue(nurseRate: number, wantsInvoicing: boolean, withCard: boolean = true): number {
  if (!wantsInvoicing) return 0;
  const familyPrice = calculateFamilyPrice(nurseRate, wantsInvoicing);
  const withRetention = nurseRate / (1 - RETENTION_RATE);
  const iva = withRetention * IVA_RATE;
  const retention = withRetention * RETENTION_RATE;
  const stripe = withCard ? familyPrice * STRIPE_RATE : 0;
  return familyPrice - iva - retention - nurseRate - stripe;
}

export function calculateShiftPrice(nurseRate: number, shiftCount: number = 1, wantsInvoicing: boolean = false): number {
  return calculateFamilyPrice(nurseRate, wantsInvoicing) * shiftCount;
}

export function getAllSpecializations(): string[] {
  return STANDARD_RATES.map(r => r.specialization);
}
