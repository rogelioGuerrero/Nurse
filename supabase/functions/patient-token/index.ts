// @ts-nocheck — Deno Edge Function
// Patient token: issue and verify HMAC-signed tokens for patient mode access
// Replaces insecure atob(familyUserId) with server-side signed tokens
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TOKEN_SECRET = Deno.env.get("PATIENT_TOKEN_SECRET") || "";
const TOKEN_TTL_DAYS = 30;

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "http://localhost:5173",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };
}

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64urlEncode(sig);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  }

  if (!TOKEN_SECRET) {
    return new Response(JSON.stringify({ error: "PATIENT_TOKEN_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  }

  try {
    const { action, family_user_id, token } = await req.json();

    if (action === "issue") {
      if (!family_user_id) {
        return new Response(JSON.stringify({ error: "family_user_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
        });
      }

      const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60;
      const payload = `${family_user_id}.${exp}`;
      const signature = await hmacSha256(payload, TOKEN_SECRET);
      const signedToken = `${base64urlEncode(new TextEncoder().encode(family_user_id))}.${exp}.${signature}`;

      return new Response(JSON.stringify({ token: signedToken, expires_at: exp }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    if (action === "verify") {
      if (!token) {
        return new Response(JSON.stringify({ error: "token is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
        });
      }

      const parts = token.split(".");
      if (parts.length !== 3) {
        return new Response(JSON.stringify({ error: "invalid_token_format" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
        });
      }

      const [encodedUserId, expStr, signature] = parts;
      const familyUserId = base64urlDecode(encodedUserId);
      const exp = parseInt(expStr, 10);

      if (isNaN(exp) || Date.now() / 1000 > exp) {
        return new Response(JSON.stringify({ error: "token_expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
        });
      }

      const payload = `${familyUserId}.${exp}`;
      const expectedSignature = await hmacSha256(payload, TOKEN_SECRET);

      if (signature !== expectedSignature) {
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
        });
      }

      return new Response(JSON.stringify({ family_user_id: familyUserId, valid: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    return new Response(JSON.stringify({ error: "action must be 'issue' or 'verify'" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } }
    );
  }
});
