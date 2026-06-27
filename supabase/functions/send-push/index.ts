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

/**
 * Base64url encode for JWT and VAPID operations
 */
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

/**
 * Create VAPID JWT for Web Push authentication
 */
async function createVapidJWT(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  };

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  // Import VAPID private key (P-256)
  // web-push generates the private key as a raw 32-byte base64url string.
  // Wrap it in a PKCS8 DER structure for crypto.subtle.importKey.
  const rawKeyBytes = base64UrlToUint8Array(VAPID_PRIVATE_KEY);
  const pkcs8Header = new Uint8Array([
    0x30, 0x3e, 0x02, 0x01, 0x00, 0x30, 0x10, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x04,
    0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8Key = new Uint8Array(pkcs8Header.length + rawKeyBytes.length);
  pkcs8Key.set(pkcs8Header, 0);
  pkcs8Key.set(rawKeyBytes, pkcs8Header.length);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );

  const signatureB64 = base64urlEncode(signature);
  return `${unsigned}.${signatureB64}`;
}

/**
 * Encrypt payload using AES128-GCM with HKDF for Web Push
 */
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; keyId: Uint8Array }> {
  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Convert subscriber keys from base64url
  const subscriberPublicKey = base64UrlToUint8Array(p256dh);
  const subscriberAuthSecret = base64UrlToUint8Array(auth);

  // Import subscriber's public key (ECDH P-256)
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    subscriberPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Generate ephemeral key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export ephemeral public key (65 bytes, uncompressed)
  const ephemeralPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey)
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // HKDF: derive content encryption key (16 bytes) and nonce (12 bytes)
  // Info for IKM: "WebPush: info\0" + subscriberPublicKey + ephemeralPublicKey
  const authSecretInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...subscriberPublicKey,
    ...ephemeralPublicKey,
  ]);

  const prkKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const ikm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: subscriberAuthSecret, info: authSecretInfo },
    prkKey,
    256
  );

  // Derive CEK (content encryption key) with info "Content-Encoding: aes128gcm\0"
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cek = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: cekInfo },
    cekKey,
    128
  );

  // Derive nonce with info "Content-Encoding: nonce\0"
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: nonceInfo },
    cekKey,
    96
  );

  // Encrypt payload with AES128-GCM
  // Pad payload: payload + \0 + padding (to make it at least 1 block + padding)
  const payloadBytes = new TextEncoder().encode(payload);
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes);
  // Last byte is padding delimiter (0x00)

  const cekCryptoKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    cekCryptoKey,
    padded
  );

  return { ciphertext, salt, keyId: ephemeralPublicKey };
}

/**
 * Build the aes128gcm content body for Web Push
 */
async function buildPushBody(
  payload: string,
  p256dh: string,
  auth: string
): Promise<ArrayBuffer> {
  const { ciphertext, salt, keyId } = await encryptPayload(payload, p256dh, auth);

  // aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const totalLen = 16 + 4 + 1 + keyId.length + ciphertext.byteLength;
  const body = new Uint8Array(totalLen);

  body.set(salt, 0);
  // Record size (rs) = 4096
  const rs = new Uint8Array(4);
  const dv = new DataView(rs.buffer);
  dv.setUint32(0, 4096);
  body.set(rs, 16);
  // keyid length
  body[20] = keyId.length;
  body.set(keyId, 21);
  body.set(new Uint8Array(ciphertext), 21 + keyId.length);

  return body.buffer;
}

/**
 * Send a push notification to a single subscription
 */
async function sendPushNotification(
  subscription: { endpoint: string; p256dh_key: string; auth_key: string },
  payload: string
): Promise<boolean> {
  try {
    const jwt = await createVapidJWT(subscription.endpoint);
    const body = await buildPushBody(payload, subscription.p256dh_key, subscription.auth_key);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "2419200",
        "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      },
      body,
    });

    if (!response.ok) {
      console.error(`Push failed: ${response.status} ${response.statusText} for ${subscription.endpoint.substring(0, 60)}...`);
      const respText = await response.text().catch(() => "");
      if (respText) console.error("Push error body:", respText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Push send error:", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, tag } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title y body son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all push subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh_key, auth_key")
      .eq("user_id", user_id);

    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No hay suscripciones push para este usuario" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
      );
    }

    const payload = JSON.stringify({ title, body, tag: tag || "biencuidar" });

    let sent = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const ok = await sendPushNotification(sub, payload);
      if (ok) {
        sent++;
      } else {
        expiredEndpoints.push(sub.endpoint);
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints)
        .eq("user_id", user_id);
    }

    return new Response(
      JSON.stringify({ sent, expired: expiredEndpoints.length }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      }
    );
  }
});
