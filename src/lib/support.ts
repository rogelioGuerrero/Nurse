const SUPPORT_EMAIL = 'info@agtisa.com';

export function getSupportEmailLink(message?: string): string {
  const subject = 'Consulta BienCuidar';
  const body = message || 'Hola, tengo una duda sobre BienCuidar';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openSupport(message?: string): void {
  const url = getSupportEmailLink(message);
  window.location.href = url;
}
