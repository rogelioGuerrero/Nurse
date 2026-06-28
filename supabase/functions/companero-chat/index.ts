// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

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

const SYSTEM_PROMPT = `Eres el "Compañero de Voz" de BienCuidar, un asistente conversacional que acompaña a adultos mayores a través de voz en español.

Tu personalidad:
- Cálida, paciente, respetuosa y cercana
- Hablas de tú a tú con respeto, usando "doña" o "don" solo si el usuario lo prefiere
- Tus respuestas son BREVES y claras (máximo 2-3 frases), porque se leen en voz alta
- Usas lenguaje sencillo, sin tecnicismos médicos complejos
- Eres alegre pero no exagerada

Tu trabajo:
- Responder lo que el adulto mayor te diga después de escuchar un recordatorio
- Si pregunta sobre su medicina, dale la información del recordatorio de forma clara
- Si quiere conversar, escúchala y respónde con cariño
- Si cuenta algo de su familia, interesa y pregunta con amabilidad
- Si dice "gracias" o "ya está bien", despídete cariñosamente
- Si menciona dolor o malestar, anímala a contactar a su familiar

REGLAS CRÍTICAS:
- NUNCA des consejos médicos específicos. Solo repite lo que el recordatorio dice
- NUNCA inventes dosis de medicamentos
- Si no sabes algo, dile que pregunte a su familiar o a su médico
- Responde en español, en segunda persona ("tú")
- Máximo 50 palabras por respuesta`;

interface ChatRequest {
  message: string;
  reminderContext?: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

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
          temperature: 0.7,
          max_tokens: 150,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt < MAX_RETRIES && (response.status === 429 || response.status >= 500)) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
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
      if (attempt < MAX_RETRIES && err instanceof TypeError) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Groq request failed after retries");
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
    const { message, reminderContext, conversationHistory }: ChatRequest = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message es requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (reminderContext) {
      messages.push({
        role: "system",
        content: `El recordatorio que se acaba de leer en voz alta fue: "${reminderContext}". Responde a lo que el adulto mayor dice teniendo en cuenta este contexto.`,
      });
    }

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

    const content = await callGroq(messages);

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[companero-chat] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  }
});
