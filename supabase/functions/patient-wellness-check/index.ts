// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@biencuidar.agtisa.com";

const INACTIVITY_THRESHOLD_HOURS = 6;

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function createVapidJWT(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: VAPID_SUBJECT };
  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const rawKeyBytes = base64UrlToUint8Array(VAPID_PRIVATE_KEY);
  const pkcs8Header = new Uint8Array([0x30,0x3e,0x02,0x01,0x00,0x30,0x10,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x05,0x2b,0x81,0x04,0x00,0x22,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20]);
  const pkcs8Key = new Uint8Array(pkcs8Header.length + rawKeyBytes.length);
  pkcs8Key.set(pkcs8Header, 0);
  pkcs8Key.set(rawKeyBytes, pkcs8Header.length);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8Key, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64urlEncode(signature)}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const subscriberPublicKey = base64UrlToUint8Array(p256dh);
  const subscriberAuthSecret = base64UrlToUint8Array(auth);
  const subscriberKey = await crypto.subtle.importKey("raw", subscriberPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeralKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey));
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: subscriberKey }, ephemeralKeyPair.privateKey, 256);
  const authSecretInfo = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...subscriberPublicKey, ...ephemeralPublicKey]);
  const prkKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const ikm = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: subscriberAuthSecret, info: authSecretInfo }, prkKey, 256);
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cek = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, cekKey, 128);
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, cekKey, 96);
  const payloadBytes = new TextEncoder().encode(payload);
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes);
  const cekCryptoKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekCryptoKey, padded);
  return { ciphertext, salt, keyId: ephemeralPublicKey };
}

async function buildPushBody(payload: string, p256dh: string, auth: string): Promise<ArrayBuffer> {
  const { ciphertext, salt, keyId } = await encryptPayload(payload, p256dh, auth);
  const totalLen = 16 + 4 + 1 + keyId.length + ciphertext.byteLength;
  const body = new Uint8Array(totalLen);
  body.set(salt, 0);
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  body.set(rs, 16);
  body[20] = keyId.length;
  body.set(keyId, 21);
  body.set(new Uint8Array(ciphertext), 21 + keyId.length);
  return body.buffer;
}

async function sendPushToSubscription(sub: { endpoint: string; p256dh_key: string; auth_key: string }, payload: string): Promise<boolean> {
  try {
    const jwt = await createVapidJWT(sub.endpoint);
    const body = await buildPushBody(payload, sub.p256dh_key, sub.auth_key);
    const response = await fetch(sub.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", "TTL": "86400", "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}` },
      body,
    });
    return response.ok;
  } catch { return false; }
}

async function sendAlert(supabase: any, familyUserId: string, subs: any[], title: string, body: string, notifType: string, logBody: string) {
  const payload = JSON.stringify({ title, body, tag: notifType });
  let sent = 0;
  for (const sub of subs) {
    const ok = await sendPushToSubscription(sub, payload);
    if (ok) sent++;
    await supabase.from('notification_logs').insert({
      family_user_id: familyUserId,
      notification_type: notifType,
      recipient_user_id: familyUserId,
      title,
      body: logBody,
      push_endpoint: sub.endpoint,
      push_status: ok ? 'sent' : 'failed',
    });
  }
  return sent;
}

async function hasRecentAlert(supabase: any, familyUserId: string, notifType: string, hours: number): Promise<boolean> {
  const { data: recent } = await supabase
    .from('notification_logs')
    .select('created_at')
    .eq('family_user_id', familyUserId)
    .eq('notification_type', notifType)
    .order('created_at', { ascending: false })
    .limit(1);
  if (recent && recent.length > 0) {
    const lastAlert = new Date(recent[0].created_at);
    const hoursSinceAlert = (Date.now() - lastAlert.getTime()) / (60 * 60 * 1000);
    return hoursSinceAlert < hours;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - INACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Get all patient activity records
    const { data: activities, error } = await supabase
      .from('patient_activity')
      .select('*');

    if (error) throw error;
    if (!activities || activities.length === 0) {
      return new Response(JSON.stringify({ checked: 0, alerted: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let alerted = 0;
    for (const activity of activities) {
      const lastSeen = new Date(activity.last_seen_at);
      const hoursInactive = (now.getTime() - lastSeen.getTime()) / (60 * 60 * 1000);

      // Get family's push subscriptions
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh_key, auth_key')
        .eq('user_id', activity.family_user_id);

      if (!subs || subs.length === 0) continue;

      // Check 1: General inactivity > 6 hours
      if (hoursInactive >= INACTIVITY_THRESHOLD_HOURS) {
        const alreadyAlerted = await hasRecentAlert(supabase, activity.family_user_id, 'wellness_alert', INACTIVITY_THRESHOLD_HOURS);
        if (!alreadyAlerted) {
          const hoursStr = Math.floor(hoursInactive);
          const sent = await sendAlert(
            supabase, activity.family_user_id, subs,
            'BienCuidar · Alerta de bienestar',
            `Tu ser querido no ha usado su teléfono en ${hoursStr} horas. Considera llamarlo o visitarlo.`,
            'wellness_alert',
            `Inactividad de ${hoursStr} horas`
          );
          if (sent > 0) alerted++;
          console.log(`[patient-wellness-check] inactivity alert: family ${activity.family_user_id}, ${hoursStr}h`);
        }
      }

      // Check 2: Unread reminders - pushes sent but patient not active recently
      // Look for reminder pushes sent in the last 3 hours where patient wasn't active
      const recentCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      if (lastSeen < recentCutoff) {
        const { data: recentPushes } = await supabase
          .from('notification_logs')
          .select('id, created_at, title, body')
          .eq('family_user_id', activity.family_user_id)
          .eq('notification_type', 'reminder')
          .eq('push_status', 'sent')
          .gte('created_at', recentCutoff.toISOString());

        if (recentPushes && recentPushes.length > 0) {
          const alreadyUnreadAlerted = await hasRecentAlert(supabase, activity.family_user_id, 'unread_reminders', 3);
          if (!alreadyUnreadAlerted) {
            const count = recentPushes.length;
            const sent = await sendAlert(
              supabase, activity.family_user_id, subs,
              'BienCuidar · Recordatorios sin escuchar',
              `Se enviaron ${count} recordatorio(s) pero tu ser querido no ha abierto su teléfono. Considera llamarlo para recordarle personalmente.`,
              'unread_reminders',
              `${count} recordatorios sin escuchar`
            );
            if (sent > 0) alerted++;
            console.log(`[patient-wellness-check] unread reminders alert: family ${activity.family_user_id}, ${count} pushes`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ checked: activities.length, alerted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[patient-wellness-check] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
