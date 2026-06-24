import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const ALLOWED_ORIGIN = `${Deno.env.get("SUPABASE_URL") || ""}`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
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

// In-memory rate limiting per IP
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

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function callGroq(
  messages: GroqMessage[],
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt < MAX_RETRIES && isRetryable(response.status)) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Groq request timed out");
      }

      const isNetworkError = err instanceof TypeError;
      if (attempt < MAX_RETRIES && isNetworkError) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Groq request failed after retries");
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
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
          ...corsHeaders(),
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

    const content = await callGroq(
      messages,
      clampedTemp,
      clampedMaxTokens,
    );

    return new Response(
      JSON.stringify({ content }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
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
          ...corsHeaders(),
        },
      },
    );
  }
});
