import { DEFAULT_COUNTRY, type CountryCode } from './countryDetect';

export const SYNTHETIC_EMAIL_DOMAIN = 'tel.biencuidar.com';

export const COUNTRY_DIAL_CODES: Record<string, { dial: string; minDigits: number; maxDigits: number; placeholder: string }> = {
  SV: { dial: '503', minDigits: 8, maxDigits: 8, placeholder: '7000-1234' },
  GT: { dial: '502', minDigits: 8, maxDigits: 8, placeholder: '5000-1234' },
  HN: { dial: '504', minDigits: 8, maxDigits: 8, placeholder: '9000-1234' },
  NI: { dial: '505', minDigits: 8, maxDigits: 8, placeholder: '8000-1234' },
  CR: { dial: '506', minDigits: 8, maxDigits: 8, placeholder: '8000-1234' },
  PA: { dial: '507', minDigits: 8, maxDigits: 8, placeholder: '6000-1234' },
  MX: { dial: '52',  minDigits: 10, maxDigits: 10, placeholder: '55 1234 5678' },
  CO: { dial: '57',  minDigits: 10, maxDigits: 10, placeholder: '300 123 4567' },
  PE: { dial: '51',  minDigits: 9, maxDigits: 9, placeholder: '912 345 678' },
  EC: { dial: '593', minDigits: 9, maxDigits: 10, placeholder: '99 123 4567' },
  CL: { dial: '56',  minDigits: 9, maxDigits: 9, placeholder: '9 1234 5678' },
  AR: { dial: '54',  minDigits: 10, maxDigits: 10, placeholder: '11 1234 5678' },
  DO: { dial: '1',   minDigits: 10, maxDigits: 10, placeholder: '809 123 4567' },
};

export function getDialConfig(country?: CountryCode | null) {
  return COUNTRY_DIAL_CODES[country ?? DEFAULT_COUNTRY] ?? COUNTRY_DIAL_CODES[DEFAULT_COUNTRY];
}

export function stripPhoneDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

export function normalizePhoneWithCountry(rawPhone: string, country?: CountryCode | null): string {
  const digits = stripPhoneDigits(rawPhone);
  const { dial, minDigits } = getDialConfig(country);
  if (digits.startsWith(dial) && digits.length >= dial.length + minDigits) {
    return digits;
  }
  return `${dial}${digits}`;
}

export function validatePhoneInput(rawPhone: string, country?: CountryCode | null): { valid: boolean; message: string; localDigits: string; e164Digits: string } {
  const digits = stripPhoneDigits(rawPhone);
  const { dial, minDigits, maxDigits } = getDialConfig(country);

  const localDigits = digits.startsWith(dial) && digits.length >= dial.length + minDigits
    ? digits.slice(dial.length)
    : digits;

  if (!localDigits) {
    return { valid: false, message: 'Ingresa tu número de teléfono / WhatsApp', localDigits: '', e164Digits: '' };
  }

  if (localDigits.length < minDigits || localDigits.length > maxDigits) {
    return {
      valid: false,
      message: minDigits === maxDigits
        ? `Ingresa un número válido de ${minDigits} dígitos`
        : `Ingresa un número válido (${minDigits} a ${maxDigits} dígitos)`,
      localDigits,
      e164Digits: '',
    };
  }

  if ((country ?? DEFAULT_COUNTRY) === 'SV' && !/^[267]/.test(localDigits)) {
    return {
      valid: false,
      message: 'En El Salvador el número debe iniciar con 6, 7 o 2',
      localDigits,
      e164Digits: '',
    };
  }

  return {
    valid: true,
    message: '',
    localDigits,
    e164Digits: `${dial}${localDigits}`,
  };
}

export function buildSyntheticEmail(rawPhone: string, country?: CountryCode | null): string {
  const e164Digits = normalizePhoneWithCountry(rawPhone, country);
  return `${e164Digits}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email?: string | null): boolean {
  if (!email) return true;
  return email.toLowerCase().trim().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

export function isEmailInput(identifier: string): boolean {
  return identifier.includes('@');
}

/**
 * Construye un link wa.me normalizando el teléfono a E.164 según el país
 * del perfil (profiles.phone guarda solo dígitos locales).
 */
export function buildWaLink(rawPhone: string | undefined | null, country?: CountryCode | null, message?: string): string | null {
  const digits = stripPhoneDigits(rawPhone || '');
  if (!digits) return null;
  const e164 = normalizePhoneWithCountry(digits, country);
  return `https://wa.me/${e164}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
