import { supabaseUrl, supabaseAnonKey } from './supabase';

/**
 * Notify marketplace participants via email + push (server-side).
 * Calls the notify-marketplace edge function which handles:
 * - new_request: notifies matching nurses when a family publishes a care request
 * - new_offer: notifies the family when a nurse submits an offer
 * - offer_accepted: notifies the nurse when a family accepts their offer
 *
 * This is fire-and-forget — failures are logged but don't block the UI.
 */

type NotifyType = 'new_request' | 'new_offer' | 'offer_accepted';

interface NotifyPayload {
  type: NotifyType;
  request_id?: string;
  offer_id?: string;
}

export async function notifyMarketplace(payload: NotifyPayload): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-marketplace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[notify-marketplace] Failed to notify:', err);
  }
}
