// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@biencuidar.agtisa.com";

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}

// === Web Push crypto helpers (same as send-push) ===
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

// === Main handler ===
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { mode, reminder_id, family_user_id } = body;

    // === MODE: test — send a specific reminder now (for demo) ===
    if (mode === "test" && reminder_id) {
      const { data: reminder, error } = await supabase
        .from("voice_reminders")
        .select("*")
        .eq("id", reminder_id)
        .single();
      if (error || !reminder) {
        return new Response(JSON.stringify({ error: "Recordatorio no encontrado" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });
      }

      // Send push to family_user_id (demo) or patient_user_id (production)
      const targetUserId = reminder.patient_user_id || reminder.family_user_id;
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh_key, auth_key")
        .eq("user_id", targetUserId);

      if (!subs || subs.length === 0) {
        // Log: no subscription
        await supabase.from("notification_logs").insert({
          family_user_id: reminder.family_user_id,
          reminder_id: reminder.id,
          notification_type: "test",
          recipient_user_id: targetUserId,
          title: "BienCuidar · Compañero",
          body: reminder.label,
          push_status: "no_subscription",
        });
        return new Response(JSON.stringify({ sent: 0, message: "No hay suscripción push para este usuario" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });
      }

      const payload = JSON.stringify({
        title: "BienCuidar · Compañero",
        body: reminder.label,
        tag: "companero-" + reminder.id,
        companero: true,
        speak: reminder.is_morning_briefing ? "" : reminder.message,
        morningBriefing: reminder.is_morning_briefing || false,
      });

      let sent = 0;
      for (const sub of subs) {
        const ok = await sendPushToSubscription(sub, payload);
        if (ok) sent++;
        // Log each attempt
        await supabase.from("notification_logs").insert({
          family_user_id: reminder.family_user_id,
          reminder_id: reminder.id,
          notification_type: "test",
          recipient_user_id: targetUserId,
          title: "BienCuidar · Compañero",
          body: reminder.label,
          payload: { speak: reminder.message, label: reminder.label },
          push_endpoint: sub.endpoint,
          push_status: ok ? "sent" : "failed",
        });
      }

      console.log(`[check-voice-reminders] test sent: ${sent} for reminder ${reminder.id}`);
      return new Response(JSON.stringify({ sent, mode: "test" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });
    }

    // === MODE: cron — check all active reminders that match current time ===
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const currentDay = now.getDay(); // 0=Sunday

    const { data: reminders, error } = await supabase
      .from("voice_reminders")
      .select("*")
      .eq("active", true)
      .eq("scheduled_time", currentTime + ":00");

    if (error) throw error;

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ checked: 0, sent: 0 }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });
    }

    let totalSent = 0;
    for (const reminder of reminders) {
      // Check if today is in days_of_week
      if (!reminder.days_of_week.includes(currentDay)) continue;

      // Avoid duplicate sends within the same minute
      if (reminder.last_sent_at) {
        const lastSent = new Date(reminder.last_sent_at);
        const diffMin = (now.getTime() - lastSent.getTime()) / 60000;
        if (diffMin < 1) continue;
      }

      const targetUserId = reminder.patient_user_id || reminder.family_user_id;
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh_key, auth_key")
        .eq("user_id", targetUserId);

      if (!subs || subs.length === 0) {
        // Log: no subscription
        await supabase.from("notification_logs").insert({
          family_user_id: reminder.family_user_id,
          reminder_id: reminder.id,
          notification_type: "reminder",
          recipient_user_id: targetUserId,
          title: "BienCuidar · Compañero",
          body: reminder.label,
          push_status: "no_subscription",
        });
        continue;
      }

      const payload = JSON.stringify({
        title: "BienCuidar · Compañero",
        body: reminder.label,
        tag: "companero-" + reminder.id,
        companero: true,
        speak: reminder.is_morning_briefing ? "" : reminder.message,
        morningBriefing: reminder.is_morning_briefing || false,
      });

      let sent = 0;
      for (const sub of subs) {
        const ok = await sendPushToSubscription(sub, payload);
        if (ok) sent++;
        // Log each attempt
        await supabase.from("notification_logs").insert({
          family_user_id: reminder.family_user_id,
          reminder_id: reminder.id,
          notification_type: "reminder",
          recipient_user_id: targetUserId,
          title: "BienCuidar · Compañero",
          body: reminder.label,
          payload: { speak: reminder.message, label: reminder.label },
          push_endpoint: sub.endpoint,
          push_status: ok ? "sent" : "failed",
        });
      }

      if (sent > 0) {
        totalSent++;
        await supabase.from("voice_reminders").update({ last_sent_at: now.toISOString() }).eq("id", reminder.id);
      }
    }

    console.log(`[check-voice-reminders] cron: checked ${reminders.length}, sent ${totalSent} at ${currentTime}`);
    return new Response(JSON.stringify({ checked: reminders.length, sent: totalSent }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[check-voice-reminders] error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } });
  }
});
