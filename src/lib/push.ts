/**
 * Web Push subscription management for BienCuidar PWA
 * Uses VAPID for authentication and PushManager for browser subscription
 */

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

// VAPID public key — safe to expose (private key is in Supabase secrets)
const VAPID_PUBLIC_KEY = 'BHSjXVKB_zik6eRg3XDXSfFoRQ6XMVFtmSwnLvenr2S849IY9gfpVF-EfMwwdvl90yciW9dfev61SrSZCea0DuA';

/**
 * Convert base64 VAPID key to Uint8Array for PushManager.subscribe()
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    arr[i] = rawData.charCodeAt(i);
  }
  return arr;
}

/**
 * Subscribe the current browser to push notifications.
 * Stores the subscription in Supabase push_subscriptions table.
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  console.log('[BienCuidar Push] subscribeToPush started for user:', userId);

  if (!('serviceWorker' in navigator)) {
    console.error('[BienCuidar Push] serviceWorker not supported');
    return false;
  }
  if (!('PushManager' in window)) {
    console.error('[BienCuidar Push] PushManager not supported');
    return false;
  }
  if (Notification.permission !== 'granted') {
    console.error('[BienCuidar Push] Notification permission not granted:', Notification.permission);
    return false;
  }

  try {
    console.log('[BienCuidar Push] Waiting for service worker ready...');
    const reg = await navigator.serviceWorker.ready;
    console.log('[BienCuidar Push] SW ready, scope:', reg.scope);

    // Check if already subscribed
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      console.log('[BienCuidar Push] Already subscribed, syncing to server');
      await syncSubscriptionToServer(existing, userId);
      return true;
    }

    console.log('[BienCuidar Push] Creating new subscription with VAPID key...');
    const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    console.log('[BienCuidar Push] VAPID key bytes:', vapidKey.length, 'bytes');

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey as BufferSource,
    });

    console.log('[BienCuidar Push] Subscription created! endpoint:', subscription.endpoint.substring(0, 60) + '...');
    await syncSubscriptionToServer(subscription, userId);
    console.log('[BienCuidar Push] Synced to server successfully');
    return true;
  } catch (err) {
    console.error('[BienCuidar Push] Subscription FAILED:', err);
    console.error('[BienCuidar Push] Error name:', (err as Error).name);
    console.error('[BienCuidar Push] Error message:', (err as Error).message);
    return false;
  }
}

/**
 * Save/update subscription in Supabase
 */
async function syncSubscriptionToServer(
  subscription: PushSubscription,
  userId: string
): Promise<void> {
  const sub = subscription.toJSON();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    console.error('[BienCuidar Push] Missing subscription data:', { endpoint: !!sub.endpoint, p256dh: !!sub.keys?.p256dh, auth: !!sub.keys?.auth });
    return;
  }

  console.log('[BienCuidar Push] Syncing to Supabase...');
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh_key: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint,user_id' });

  if (error) {
    console.error('[BienCuidar Push] Supabase sync error:', error.message);
  } else {
    console.log('[BienCuidar Push] Supabase sync OK');
  }
}

/**
 * Unsubscribe from push (e.g. on logout)
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint);
    }
  } catch {
    // Silent fail on cleanup
  }
}

/**
 * Send a push notification to a specific user via the Edge Function.
 * Falls back silently if push is not configured.
 */
export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; tag?: string }
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        title: payload.title,
        body: payload.body,
        tag: payload.tag || 'biencuidar',
      }),
    });
  } catch {
    // Silent fail — push is best-effort
  }
}
