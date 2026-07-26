/**
 * Feature flags por país.
 * Controla qué funcionalidades están activas según el país detectado.
 */

import type { CountryCode } from './countryDetect';
import { isElSalvador } from './countryDetect';

export interface CountryFeatures {
  /** Verificación CSSP (Consejo Superior de Salud Pública) */
  csspVerification: boolean;
  /** Campo DUI en el registro */
  duiRequired: boolean;
  /** Facturación electrónica, retención ISR, IVA */
  fiscalInvoicing: boolean;
  /** Departamentos y municipios de El Salvador */
  salvadoranDistricts: boolean;
  /** Calculadora tributaria en el perfil de enfermera */
  taxCalculator: boolean;
  /** Términos legales específicos de El Salvador */
  salvadoranLegalTerms: boolean;
}

const SV_FEATURES: CountryFeatures = {
  csspVerification: true,
  duiRequired: true,
  fiscalInvoicing: true,
  salvadoranDistricts: true,
  taxCalculator: true,
  salvadoranLegalTerms: true,
};

const GENERIC_FEATURES: CountryFeatures = {
  csspVerification: false,
  duiRequired: false,
  fiscalInvoicing: false,
  salvadoranDistricts: false,
  taxCalculator: false,
  salvadoranLegalTerms: false,
};

export function getFeatures(country: CountryCode | undefined | null): CountryFeatures {
  return isElSalvador(country) ? SV_FEATURES : GENERIC_FEATURES;
}

/** Lista de países LatAm para el selector manual */
export const LATAM_COUNTRIES: { code: string; name: string }[] = [
  { code: 'SV', name: 'El Salvador' },
  { code: 'MX', name: 'México' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'HN', name: 'Honduras' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'PA', name: 'Panamá' },
  { code: 'CO', name: 'Colombia' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'PE', name: 'Perú' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'CL', name: 'Chile' },
  { code: 'AR', name: 'Argentina' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'CU', name: 'Cuba' },
  { code: 'PR', name: 'Puerto Rico' },
];

export function countryNameFromCode(code: string): string {
  const found = LATAM_COUNTRIES.find(c => c.code === code);
  return found?.name || code;
}
