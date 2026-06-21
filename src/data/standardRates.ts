export interface StandardRate {
  specialization: string;
  suggestedRate: number; // suggested nurse rate per 8-hour shift
}

export const PLATFORM_COMMISSION = 5; // fixed $5 per shift when invoicing
export const IVA_RATE = 0.13; // 13% IVA sobre comision de intermediacion (NO sobre servicio de salud)
export const RETENTION_RATE = 0.10; // 10% retencion de ISR (Impuesto sobre la Renta)
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
// Servicio de enfermeria: IVA 0% (exento). Comision de intermediacion: IVA 13%
export function calculateFamilyPrice(nurseRate: number, wantsInvoicing: boolean): number {
  if (!wantsInvoicing) return nurseRate;
  const commissionWithIVA = PLATFORM_COMMISSION * (1 + IVA_RATE);
  return nurseRate + commissionWithIVA;
}

// What the nurse receives net per shift
export function calculateNurseNet(nurseRate: number, wantsInvoicing: boolean): number {
  if (!wantsInvoicing) return nurseRate;
  return nurseRate * (1 - RETENTION_RATE);
}

// What BienCuidar keeps per shift (commission minus IVA to pay, minus Stripe)
export function calculatePlatformRevenue(nurseRate: number, wantsInvoicing: boolean, withCard: boolean = true): number {
  if (!wantsInvoicing) return 0;
  const familyPrice = calculateFamilyPrice(nurseRate, wantsInvoicing);
  const retention = nurseRate * RETENTION_RATE;
  const ivaOnCommission = PLATFORM_COMMISSION * IVA_RATE;
  const stripe = withCard ? familyPrice * STRIPE_RATE : 0;
  return familyPrice - nurseRate - retention - ivaOnCommission - stripe;
}

export function calculateShiftPrice(nurseRate: number, shiftCount: number = 1, wantsInvoicing: boolean = false): number {
  return calculateFamilyPrice(nurseRate, wantsInvoicing) * shiftCount;
}

export function getAllSpecializations(): string[] {
  return STANDARD_RATES.map(r => r.specialization);
}
