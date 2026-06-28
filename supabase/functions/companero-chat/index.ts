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
- Hablas de tú a tú con respeto
- Tus respuestas son BREVES y claras (máximo 2-3 frases), porque se leen en voz alta
- Usas lenguaje sencillo, sin tecnicismos
- Eres alegre pero no exagerada

CLASIFICACIÓN DE INTENCIÓN:
Cada vez que el adulto mayor te habla, debes clasificar su mensaje en una de dos categorías:

1. "chat" — Conversación segura. Temas permitidos:
   - Charla general (cómo estás, qué día bonito)
   - Cuentos e historias (cuéntame un cuento)
   - Recuerdos y familia (hablame de mi hija)
   - Motivación y ánimo
   - Confirmación del recordatorio tal cual fue dicho (sin agregar información médica)
   - Despedidas (gracias, adiós, ya está bien)

2. "escalate" — Requiere la familia. Temas que DEBEN escalarse:
   - Preguntas sobre medicamentos: "¿cuál pastilla?", "¿qué dosis?", "¿la azul o la roja?"
   - Preguntas sobre síntomas: "me duele la cabeza", "me siento mareada", "tengo náuseas"
   - Preguntas médicas: "¿puedo tomar esto?", "¿esto es normal?"
   - Cualquier duda que requiera conocimiento médico específico
   - Malestar físico de cualquier tipo

REGLAS CRÍTICAS:
- NUNCA des consejos médicos. NUNCA inventes dosis. NUNCA identifiques medicamentos.
- Si el mensaje es "chat", responde con cariño y brevedad.
- Si el mensaje es "escalate", NO respondas la pregunta médica. En su lugar, di algo cálido como "Esa pregunta se la voy a enviar a tu familia para que te responda pronto" y marca type como "escalate".
- Responde en español, en segunda persona ("tú")
- Máximo 50 palabras por respuesta

FORMATO DE RESPUESTA:
Debes responder SIEMPRE en formato JSON válido:
{"type": "chat", "spoken": "tu respuesta cálida"}
o
{"type": "escalate", "spoken": "mensaje cálido diciendo que le vas a preguntar a la familia", "question": "la pregunta original del adulto mayor para enviar a la familia"}

El campo "question" solo se incluye cuando type es "escalate". Debe ser una versión clara y breve de lo que el adulto mayor preguntó, lista para que la familia la lea.`;

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
          temperature: 0.5,
          max_tokens: 200,
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

function parseGroqResponse(raw: string): { type: string; spoken: string; question?: string } {
  // Try to parse as JSON first
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    if (parsed.type === "escalate") {
      return {
        type: "escalate",
        spoken: parsed.spoken || "Esa pregunta se la voy a enviar a tu familia para que te responda pronto.",
        question: parsed.question || "",
      };
    }
    return {
      type: "chat",
      spoken: parsed.spoken || parsed.content || raw,
    };
  } catch {
    // If JSON parsing fails, treat as plain chat
    return { type: "chat", spoken: raw };
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

    const rawResponse = await callGroq(messages);
    const parsed = parseGroqResponse(rawResponse);

    return new Response(JSON.stringify(parsed), {
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
