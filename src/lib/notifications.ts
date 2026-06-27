/**
 * PWA notification utilities — uses the browser Notification API for local
 * notifications and Web Push API for cross-device delivery.
 * Works on installed PWA and desktop browsers.
 */

import { sendPushNotification } from './push';

type NotifPayload = {
  title: string;
  body: string;
  tag?: string;
  /** If provided, also sends a Web Push to this user ID */
  pushUserId?: string;
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

export function sendNotification({ title, body, tag, pushUserId }: NotifPayload): void {
  // Local notification (works only if tab is open)
  if (hasNotificationPermission()) {
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

  // Web Push (delivers even if tab is closed, to other devices)
  if (pushUserId) {
    sendPushNotification(pushUserId, { title, body, tag });
  }
}

/**
 * Notify family that a nurse submitted an offer for their care request.
 */
export function notifyNewOffer(nurseName: string, patientName: string, familyUserId?: string): void {
  sendNotification({
    title: 'Nueva oferta de cuidado',
    body: `${nurseName} ha enviado una oferta para cuidar a ${patientName}. Revisa tu panel para ver los detalles.`,
    tag: 'new-offer',
    pushUserId: familyUserId,
  });
}

/**
 * Notify nurse that the family accepted their offer.
 */
export function notifyOfferAccepted(patientName: string, nurseUserId?: string): void {
  sendNotification({
    title: 'Oferta aceptada',
    body: `La familia de ${patientName} ha aceptado tu oferta. Revisa tus servicios agendados.`,
    tag: 'offer-accepted',
    pushUserId: nurseUserId,
  });
}

/**
 * Notify family that the nurse has checked in.
 */
export function notifyCheckIn(nurseName: string, familyUserId?: string): void {
  sendNotification({
    title: 'Enfermera en el sitio',
    body: `${nurseName} ha registrado su llegada (check-in GPS).`,
    tag: 'check-in',
    pushUserId: familyUserId,
  });
}

/**
 * Notify family that the nurse has checked out.
 */
export function notifyCheckOut(nurseName: string, familyUserId?: string): void {
  sendNotification({
    title: 'Servicio finalizado',
    body: `${nurseName} ha registrado su salida (check-out GPS). Revisa el reporte de visita.`,
    tag: 'check-out',
    pushUserId: familyUserId,
  });
}

/**
 * Notify nurse of a new care request matching their specialization.
 */
export function notifyNewCareRequest(specialization: string, nurseUserId?: string): void {
  sendNotification({
    title: 'Nueva solicitud de cuidado',
    body: `Hay una nueva solicitud que coincide con tu especialización: ${specialization}.`,
    tag: 'new-request',
    pushUserId: nurseUserId,
  });
}

/**
 * Notify nurse that payment has been confirmed by admin.
 */
export function notifyPaymentConfirmed(patientName: string, nurseUserId?: string): void {
  sendNotification({
    title: 'Pago confirmado',
    body: `El pago para el servicio de ${patientName} ha sido verificado. Ya puedes asistir.`,
    tag: 'payment-confirmed',
    pushUserId: nurseUserId,
  });
}
