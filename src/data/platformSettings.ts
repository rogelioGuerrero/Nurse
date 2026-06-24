// Platform-wide configurable settings
// All time values are in hours unless otherwise noted

export interface PlatformSettings {
  // Hours the family waits for nurses to respond before the plan is finalized
  responseWindowHours: number;
  // Hours after which an unresponded care request expires
  requestExpirationHours: number;
  // Hours after which a pending booking auto-cancels
  pendingBookingExpirationHours: number;
  // Bank account for manual transfers
  bankName: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankAccountType: string;
}

export const PLATFORM_SETTINGS: PlatformSettings = {
  responseWindowHours: 12,
  requestExpirationHours: 24,
  pendingBookingExpirationHours: 24,
  bankName: 'BAC Credomatic',
  bankAccountHolder: 'AGTI, S.A. de C.V.',
  bankAccountNumber: '123456789',
  bankAccountType: 'Cuenta Corriente',
};

export function getResponseDeadline(createdAt: string): string {
  const d = new Date(createdAt);
  d.setHours(d.getHours() + PLATFORM_SETTINGS.responseWindowHours);
  return d.toISOString();
}

export function isWindowExpired(createdAt: string): boolean {
  const deadline = new Date(createdAt);
  deadline.setHours(deadline.getHours() + PLATFORM_SETTINGS.responseWindowHours);
  return Date.now() >= deadline.getTime();
}

export function getTimeRemaining(createdAt: string): string {
  const deadline = new Date(createdAt);
  deadline.setHours(deadline.getHours() + PLATFORM_SETTINGS.responseWindowHours);
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return 'Expirado';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
