/**
 * PWA notification utilities — uses the browser Notification API.
 * Works on installed PWA and desktop browsers. No push server required.
 */

type NotifPayload = {
  title: string;
  body: string;
  tag?: string;
};

let permissionRequested = false;

export function requestNotificationPermission(): void {
  if (permissionRequested) return;
  permissionRequested = true;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function hasNotificationPermission(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function sendNotification({ title, body, tag }: NotifPayload): void {
  if (!hasNotificationPermission()) return;
  try {
    const n = new Notification(title, {
      body,
      tag: tag || 'biencuidar',
      icon: '/icon.svg',
      badge: '/icon.svg',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Service worker notification fallback
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, { body, tag, icon: '/icon.svg' });
      });
    }
  }
}

/**
 * Notify family that a nurse submitted an offer for their care request.
 */
export function notifyNewOffer(nurseName: string, patientName: string): void {
  sendNotification({
    title: 'Nueva oferta de cuidado',
    body: `${nurseName} ha enviado una oferta para cuidar a ${patientName}. Revisa tu panel para ver los detalles.`,
    tag: 'new-offer',
  });
}

/**
 * Notify nurse that the family accepted their offer.
 */
export function notifyOfferAccepted(patientName: string): void {
  sendNotification({
    title: 'Oferta aceptada',
    body: `La familia de ${patientName} ha aceptado tu oferta. Revisa tus servicios agendados.`,
    tag: 'offer-accepted',
  });
}

/**
 * Notify family that the nurse has checked in.
 */
export function notifyCheckIn(nurseName: string): void {
  sendNotification({
    title: 'Enfermera en el sitio',
    body: `${nurseName} ha registrado su llegada (check-in GPS).`,
    tag: 'check-in',
  });
}

/**
 * Notify family that the nurse has checked out.
 */
export function notifyCheckOut(nurseName: string): void {
  sendNotification({
    title: 'Servicio finalizado',
    body: `${nurseName} ha registrado su salida (check-out GPS). Revisa el reporte de visita.`,
    tag: 'check-out',
  });
}

/**
 * Notify nurse of a new care request matching their specialization.
 */
export function notifyNewCareRequest(specialization: string): void {
  sendNotification({
    title: 'Nueva solicitud de cuidado',
    body: `Hay una nueva solicitud que coincide con tu especialización: ${specialization}.`,
    tag: 'new-request',
  });
}
