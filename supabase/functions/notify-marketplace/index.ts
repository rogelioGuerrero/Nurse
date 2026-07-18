// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const REPLY_TO = "info@agtisa.com";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const VAPID_SUBJECT = "mailto:admin@biencuidar.agtisa.com";

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
  "http://localhost:5173",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}

// ===== Email helpers =====

function emailWrap(body: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1e293b; line-height: 1.6;">
  <div style="background: #0d9488; border-radius: 8px 8px 0 0; padding: 20px 24px;">
    <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">BienCuidar</p>
    <p style="margin: 4px 0 0; color: #99f6e4; font-size: 13px;">Plataforma de cuidado de salud en El Salvador</p>
  </div>
  <div style="background: #f8fafc; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
    ${body}
  </div>
  <p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 16px 0 0;">info@agtisa.com — El Salvador</p>
</div>`;
}

function ep(text: string): string {
  return `<p style="margin: 0 0 16px; font-size: 15px;">${text}</p>`;
}

function ebtn(text: string, url: string): string {
  return `<a href="${url}" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; margin: 0 0 16px;">${text}</a>`;
}

function esign(): string {
  return `<p style="margin: 0; font-size: 14px; color: #64748b;">Saludos,<br><strong>Equipo BienCuidar</strong></p>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BienCuidar <info@agtisa.com>",
        to,
        subject,
        html,
        text: htmlToText(html),
        headers: { "Reply-To": REPLY_TO },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Email send failed:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

// ===== Push helpers (reused from send-push) =====

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
  const pkcs8Header = new Uint8Array([
    0x30, 0x3e, 0x02, 0x01, 0x00, 0x30, 0x10, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x04,
    0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8Key = new Uint8Array(pkcs8Header.length + rawKeyBytes.length);
  pkcs8Key.set(pkcs8Header, 0);
  pkcs8Key.set(rawKeyBytes, pkcs8Header.length);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8Key, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64urlEncode(signature)}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; keyId: Uint8Array }> {
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
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "2419200",
        "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendPushToUser(supabase: any, userId: string, payload: { title: string; body: string; tag?: string }): Promise<{ sent: number; expired: number }> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh_key, auth_key")
    .eq("user_id", userId);
  if (error || !subs || subs.length === 0) return { sent: 0, expired: 0 };

  const json = JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag || "biencuidar" });
  let sent = 0;
  const expired: string[] = [];
  for (const sub of subs) {
    const ok = await sendPushToSubscription(sub, json);
    if (ok) sent++;
    else expired.push(sub.endpoint);
  }
  if (expired.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expired).eq("user_id", userId);
  }
  return { sent, expired: expired.length };
}

// ===== Notification handlers =====

/**
 * NEW_CARE_REQUEST: Family published a request → notify matching nurses
 * Finds nurses whose specialization matches and who are within coverage radius
 */
async function handleNewCareRequest(supabase: any, data: { request_id: string }): Promise<{ notified: number; emails: number; pushes: number }> {
  // Get the care request with family info
  const { data: request, error: reqError } = await supabase
    .from("care_requests")
    .select(`
      id, patient_name, patient_condition, specialization_needed, location_name, lat, lng,
      user_id, profiles!inner(email, full_name)
    `)
    .eq("id", data.request_id)
    .single();
  if (reqError || !request) {
    console.error("Failed to fetch care request:", reqError);
    return { notified: 0, emails: 0, pushes: 0 };
  }

  // Find active, CSSP-verified nurses who match specialization
  let query = supabase
    .from("nurses")
    .select(`
      id, user_id, lat, lng, coverage_radius, specialization,
      profiles!inner(email, full_name)
    `)
    .eq("is_active", true)
    .eq("cssp_verified", true);

  const { data: nurses, error: nursesError } = await query;
  if (nursesError || !nurses) {
    console.error("Failed to fetch nurses:", nursesError);
    return { notified: 0, emails: 0, pushes: 0 };
  }

  // Filter by specialization match and geographic proximity
  const requestSpecs = Array.isArray(request.specialization_needed) ? request.specialization_needed : [];
  const matchingNurses = nurses.filter((n: any) => {
    // Specialization match: nurse has at least one of the requested specializations
    const nurseSpecs = Array.isArray(n.specialization) ? n.specialization : [];
    const specMatch = requestSpecs.length === 0 || nurseSpecs.some((s: string) => requestSpecs.includes(s));

    // Geographic match: within nurse's coverage radius (if both have coordinates)
    let geoMatch = true;
    if (request.lat != null && request.lng != null && n.lat != null && n.lng != null) {
      const distance = haversine(request.lat, request.lng, n.lat, n.lng);
      const radius = n.coverage_radius || 5;
      geoMatch = distance <= radius;
    }

    return specMatch && geoMatch;
  });

  let emails = 0;
  let pushes = 0;

  for (const nurse of matchingNurses) {
    const nurseName = nurse.profiles?.full_name?.split(" ")[0] || "Enfermera";
    const nurseEmail = nurse.profiles?.email;

    // Send email
    if (nurseEmail) {
      const html = emailWrap(`
        ${ep(`Hola ${nurseName},`)}
        ${ep(`Hay una <strong>nueva solicitud de cuidado</strong> que coincide con tu especialización.`)}
        ${ep(`<strong>Paciente:</strong> ${request.patient_name}<br>
              <strong>Condición:</strong> ${request.patient_condition || "No especificada"}<br>
              <strong>Especialidad requerida:</strong> ${requestSpecs.join(", ") || "General"}<br>
              <strong>Ubicación:</strong> ${request.location_name || "No especificada"}`)}
        ${ep(`Ingresá a BienCuidar para ver los detalles y enviar tu oferta.`)}
        ${ebtn("Ver solicitud", "https://biencuidar.agtisa.com")}
        ${esign()}
      `);
      const ok = await sendEmail(nurseEmail, `Nueva solicitud de cuidado: ${request.patient_name}`, html);
      if (ok) emails++;
    }

    // Send push
    const pushResult = await sendPushToUser(supabase, nurse.user_id, {
      title: "Nueva solicitud de cuidado",
      body: `Hay una nueva solicitud que coincide con tu especialización: ${requestSpecs.join(", ") || "General"}.`,
      tag: "new-request",
    });
    pushes += pushResult.sent;
  }

  return { notified: matchingNurses.length, emails, pushes };
}

/**
 * NEW_OFFER: Nurse submitted an offer → notify the family
 */
async function handleNewOffer(supabase: any, data: { offer_id: string }): Promise<{ emails: number; pushes: number }> {
  const { data: offer, error: offerError } = await supabase
    .from("care_offers")
    .select(`
      id, offered_rate, notes, request_id, nurse_id,
      care_requests!inner(patient_name, user_id, profiles!inner(email, full_name)),
      nurses!inner(user_id, profiles!inner(full_name))
    `)
    .eq("id", data.offer_id)
    .single();
  if (offerError || !offer) {
    console.error("Failed to fetch care offer:", offerError);
    return { emails: 0, pushes: 0 };
  }

  const familyEmail = offer.care_requests?.profiles?.email;
  const familyName = offer.care_requests?.profiles?.full_name?.split(" ")[0] || "Familia";
  const nurseName = offer.nurses?.profiles?.full_name || "Una enfermera";
  const patientName = offer.care_requests?.patient_name || "el paciente";
  const familyUserId = offer.care_requests?.user_id;

  let emails = 0;
  let pushes = 0;

  // Send email to family
  if (familyEmail) {
    const html = emailWrap(`
      ${ep(`Hola ${familyName},`)}
      ${ep(`<strong>${nurseName}</strong> ha enviado una oferta para cuidar a <strong>${patientName}</strong>.`)}
      ${ep(`<strong>Tarifa ofrecida:</strong> $${offer.offered_rate}<br>
            ${offer.notes ? `<strong>Mensaje:</strong> ${offer.notes}` : ""}`)}
      ${ep(`Ingresá a BienCuidar para revisar la oferta y aceptarla.`)}
      ${ebtn("Revisar oferta", "https://biencuidar.agtisa.com")}
      ${esign()}
    `);
    const ok = await sendEmail(familyEmail, `${nurseName} envió una oferta para ${patientName}`, html);
    if (ok) emails++;
  }

  // Send push to family
  if (familyUserId) {
    const pushResult = await sendPushToUser(supabase, familyUserId, {
      title: "Nueva oferta de cuidado",
      body: `${nurseName} ha enviado una oferta para cuidar a ${patientName}. Revisa tu panel para ver los detalles.`,
      tag: "new-offer",
    });
    pushes += pushResult.sent;
  }

  return { emails, pushes };
}

/**
 * OFFER_ACCEPTED: Family accepted an offer → notify the nurse
 */
async function handleOfferAccepted(supabase: any, data: { offer_id: string }): Promise<{ emails: number; pushes: number }> {
  const { data: offer, error: offerError } = await supabase
    .from("care_offers")
    .select(`
      id, offered_rate, request_id, nurse_id,
      care_requests!inner(patient_name, patient_condition, location_name, user_id, profiles!inner(full_name)),
      nurses!inner(user_id, profiles!inner(email, full_name))
    `)
    .eq("id", data.offer_id)
    .single();
  if (offerError || !offer) {
    console.error("Failed to fetch accepted offer:", offerError);
    return { emails: 0, pushes: 0 };
  }

  const nurseEmail = offer.nurses?.profiles?.email;
  const nurseName = offer.nurses?.profiles?.full_name?.split(" ")[0] || "Enfermera";
  const nurseUserId = offer.nurses?.user_id;
  const patientName = offer.care_requests?.patient_name || "el paciente";
  const patientCondition = offer.care_requests?.patient_condition || "No especificada";
  const locationName = offer.care_requests?.location_name || "No especificada";

  let emails = 0;
  let pushes = 0;

  // Send email to nurse
  if (nurseEmail) {
    const html = emailWrap(`
      ${ep(`Hola ${nurseName},`)}
      ${ep(`¡Buenas noticias! La familia ha <strong>aceptado tu oferta</strong> para cuidar a <strong>${patientName}</strong>.`)}
      ${ep(`<strong>Paciente:</strong> ${patientName}<br>
            <strong>Condición:</strong> ${patientCondition}<br>
            <strong>Ubicación:</strong> ${locationName}<br>
            <strong>Tu tarifa:</strong> $${offer.offered_rate}`)}
      ${ep(`Ingresá a BienCuidar para ver los detalles del servicio agendado.`)}
      ${ebtn("Ver servicio", "https://biencuidar.agtisa.com")}
      ${esign()}
    `);
    const ok = await sendEmail(nurseEmail, `Oferta aceptada: ${patientName}`, html);
    if (ok) emails++;
  }

  // Send push to nurse
  if (nurseUserId) {
    const pushResult = await sendPushToUser(supabase, nurseUserId, {
      title: "Oferta aceptada",
      body: `La familia de ${patientName} ha aceptado tu oferta. Revisa tus servicios agendados.`,
      tag: "offer-accepted",
    });
    pushes += pushResult.sent;
  }

  return { emails, pushes };
}

// ===== Utils =====

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ===== Main handler =====

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
    // Validate JWT and extract user
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from JWT
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
      });
    }
    const user = await userRes.json();
    const userId = user.id;

    const { type, ...data } = await req.json();

    if (!type) {
      return new Response(
        JSON.stringify({ error: "type es requerido (new_request | new_offer | offer_accepted)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Ownership validation: verify the user is authorized for this action
    if (type === "new_request" && data.request_id) {
      const { data: req } = await supabase.from("care_requests").select("user_id").eq("id", data.request_id).single();
      if (!req || req.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Not authorized for this request" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
        });
      }
    } else if (type === "new_offer" && data.offer_id) {
      const { data: offer } = await supabase
        .from("care_offers")
        .select("nurse_id, nurses!inner(user_id)")
        .eq("id", data.offer_id)
        .single();
      if (!offer || offer.nurses?.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Not authorized for this offer" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
        });
      }
    } else if (type === "offer_accepted" && data.offer_id) {
      const { data: offer } = await supabase
        .from("care_offers")
        .select("request_id, care_requests!inner(user_id)")
        .eq("id", data.offer_id)
        .single();
      if (!offer || offer.care_requests?.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Not authorized for this offer" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
        });
      }
    }

    let result;
    switch (type) {
      case "new_request":
        if (!data.request_id) {
          return new Response(JSON.stringify({ error: "request_id es requerido para new_request" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
          });
        }
        result = await handleNewCareRequest(supabase, data);
        break;

      case "new_offer":
        if (!data.offer_id) {
          return new Response(JSON.stringify({ error: "offer_id es requerido para new_offer" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
          });
        }
        result = await handleNewOffer(supabase, data);
        break;

      case "offer_accepted":
        if (!data.offer_id) {
          return new Response(JSON.stringify({ error: "offer_id es requerido para offer_accepted" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) }
          });
        }
        result = await handleOfferAccepted(supabase, data);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Tipo "${type}" no reconocido. Disponibles: new_request, new_offer, offer_accepted` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, type, ...result }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
    );
  }
});
