// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@biencuidar.agtisa.com";

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

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" } });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { start, end } = getWeekRange();
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Get all patient activities
    const { data: activities } = await supabase.from('patient_activity').select('*');
    if (!activities || activities.length === 0) {
      return new Response(JSON.stringify({ summaries: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const summaries: any[] = [];

    for (const activity of activities) {
      const familyUserId = activity.family_user_id;

      // Count reminders sent this week
      const { count: remindersCount } = await supabase
        .from('notification_logs')
        .select('*', { count: 'exact', head: true })
        .eq('family_user_id', familyUserId)
        .eq('notification_type', 'reminder')
        .eq('push_status', 'sent')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Count escalations + family requests this week
      const { count: escalationsCount } = await supabase
        .from('benni_messages')
        .select('*', { count: 'exact', head: true })
        .eq('family_user_id', familyUserId)
        .eq('direction', 'patient_to_family')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Count emergency button presses this week
      const { count: emergencyCount } = await supabase
        .from('benni_messages')
        .select('*', { count: 'exact', head: true })
        .eq('family_user_id', familyUserId)
        .eq('direction', 'patient_to_family')
        .ilike('message', '%BOTÓN DE EMERGENCIA%')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Count wellness alerts this week
      const { count: wellnessAlertsCount } = await supabase
        .from('notification_logs')
        .select('*', { count: 'exact', head: true })
        .eq('family_user_id', familyUserId)
        .in('notification_type', ['wellness_alert', 'unread_reminders'])
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Last activity
      const lastSeen = activity.last_seen_at;
      const hoursAgo = Math.floor((Date.now() - new Date(lastSeen).getTime()) / (60 * 60 * 1000));

      const summary = {
        family_user_id: familyUserId,
        week_start: startISO,
        week_end: endISO,
        reminders_sent: remindersCount || 0,
        escalations: escalationsCount || 0,
        emergency_presses: emergencyCount || 0,
        wellness_alerts: wellnessAlertsCount || 0,
        last_seen_hours_ago: hoursAgo,
      };

      summaries.push(summary);

      // If called via POST (cron), send push to family
      if (req.method === "POST") {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh_key, auth_key')
          .eq('user_id', familyUserId);

        if (subs && subs.length > 0) {
          const pushBody = `Resumen semanal disponible: ${summary.reminders_sent} recordatorios, ${summary.escalations} mensajes escalados, ${summary.emergency_presses} emergencias. Revisa el panel de Modo Paciente.`;
          const payload = JSON.stringify({
            title: 'BienCuidar · Resumen semanal',
            body: pushBody,
            tag: 'weekly-summary',
          });

          for (const sub of subs) {
            const ok = await sendPushToSubscription(sub, payload);
            await supabase.from('notification_logs').insert({
              family_user_id: familyUserId,
              notification_type: 'weekly_summary',
              recipient_user_id: familyUserId,
              title: 'BienCuidar · Resumen semanal',
              body: pushBody,
              push_endpoint: sub.endpoint,
              push_status: ok ? 'sent' : 'failed',
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ summaries }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[patient-weekly-summary] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
