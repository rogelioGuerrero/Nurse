/**
 * Detección de país por IP geolocation.
 * Usa ip-api.com (gratis, sin token, 45 req/min).
 * Cachea en localStorage para no llamar la API cada vez.
 */

export type CountryCode = string; // ISO 3166-1 alpha-2, ej: 'SV', 'MX', 'CO'

interface GeoResult {
  countryCode: CountryCode;
  countryName: string;
  city: string;
  lat: number;
  lon: number;
}

const CACHE_KEY = 'biencuidar_geo';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

let cachedResult: GeoResult | null = null;
let detecting: Promise<GeoResult | null> | null = null;

export function getCachedCountry(): GeoResult | null {
  if (cachedResult) return cachedResult;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: GeoResult; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    cachedResult = parsed.data;
    return cachedResult;
  } catch {
    return null;
  }
}

export async function detectCountry(): Promise<GeoResult | null> {
  const cached = getCachedCountry();
  if (cached) return cached;

  if (detecting) return detecting;

  detecting = (async () => {
    try {
      const res = await fetch('https://ip-api.com/json/?fields=status,countryCode,country,city,lat,lon');
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 'success') return null;

      const result: GeoResult = {
        countryCode: data.countryCode,
        countryName: data.country,
        city: data.city || '',
        lat: data.lat,
        lon: data.lon,
      };

      cachedResult = result;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
      } catch { /* localStorage lleno o no disponible */ }

      return result;
    } catch {
      return null;
    } finally {
      detecting = null;
    }
  })();

  return detecting;
}

export function isElSalvador(country: CountryCode | undefined | null): boolean {
  return country === 'SV';
}
