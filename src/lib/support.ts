const WHATSAPP_NUMBER = '50379293710';

export function getSupportWaLink(message?: string): string {
  const text = message || 'Hola, tengo una duda sobre BienCuidar';
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function openSupport(message?: string): void {
  const url = getSupportWaLink(message);
  window.open(url, '_blank');
}
