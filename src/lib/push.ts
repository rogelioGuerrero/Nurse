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
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await syncSubscriptionToServer(existing, userId);
      return true;
    }

    // Create new subscription
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    await syncSubscriptionToServer(subscription, userId);
    return true;
  } catch (err) {
    console.warn('Push subscription failed:', err);
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
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;

  await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh_key: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint,user_id' });
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
