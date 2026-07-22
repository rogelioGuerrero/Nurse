// @ts-nocheck — This file runs in Deno (Supabase Edge Functions), not in the browser/Node context
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGroqCached } from "../_shared/groq.ts";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

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

interface GroqMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequest {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
}
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count++;
  return true;
}

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(req.headers.get("Origin") || undefined),
          "Retry-After": "60",
        },
      },
    );
  }

  try {
    const { messages, temperature, maxTokens }: ChatRequest = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages es requerido y debe ser un array no vacío" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (messages.length > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({ error: `Máximo ${MAX_MESSAGES} mensajes por solicitud` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== "string") {
        return new Response(
          JSON.stringify({ error: "Cada mensaje debe tener contenido de texto" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(
          JSON.stringify({ error: `Cada mensaje no puede exceder ${MAX_MESSAGE_LENGTH} caracteres` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const clampedTemp = Math.max(0, Math.min(1, temperature ?? 0.6));
    const clampedMaxTokens = Math.max(100, Math.min(2000, maxTokens ?? 600));

    const content = await callGroqCached(
      messages,
      { temperature: clampedTemp, maxTokens: clampedMaxTokens },
    );

    return new Response(
      JSON.stringify({ content }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(req.headers.get("Origin") || undefined),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(req.headers.get("Origin") || undefined),
        },
      },
    );
  }
});
