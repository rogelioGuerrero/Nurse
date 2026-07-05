// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGroq } from "../_shared/groq.ts";

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
  "http://localhost:3000",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}

const SYSTEM_PROMPT = `Eres "Benni", el asistente conversacional de BienCuidar que acompaña a adultos mayores a través de voz en español.

CONTEXTO TEMPORAL: {CURRENT_DATETIME}

Tu personalidad:
- Cálida, paciente, respetuosa y cercana
- Hablas de tú a tú con respeto
- Tus respuestas son BREVES y claras (máximo 2-3 frases), porque se leen en voz alta
- Usas lenguaje sencillo, sin tecnicismos
- Eres alegre pero no exagerada

CLASIFICACIÓN DE INTENCIÓN:
Cada vez que el adulto mayor te habla, debes clasificar su mensaje en una de dos categorías:

1. "chat" — Conversación segura. TODO lo que no sea malestar físico o medicamentos:
   - Charla general (cómo estás, qué día bonito)
   - Preguntas sobre fecha, hora o clima (qué día es hoy, qué hora es)
   - Cuentos e historias (cuéntame un cuento)
   - Recuerdos y familia (hablame de mi hija)
   - Motivación y ánimo
   - Peticiones de visita o contacto ("vení a verme", "llamá a mi hijo") — NO se escalan, el paciente tiene un botón rojo para eso
   - Confirmación del recordatorio tal cual fue dicho (sin agregar información médica)
   - Despedidas (gracias, adiós, ya está bien)

2. "escalate" — SOLO cuando el paciente expresa malestar físico verbalmente:
   - Síntomas: "me duele la cabeza", "me siento mareada", "tengo náuseas"
   - Medicamentos: "¿cuál pastilla?", "¿qué dosis?", "¿la azul o la roja?"
   - Emergencias verbales: "me caí", "no puedo respirar", "me siento muy mal"
   - Malestar físico de cualquier tipo
   NUNCA escales trivialidades, fecha, hora, clima, charla, recuerdos, o peticiones de visita.

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

async function benniLLM(messages: { role: string; content: string }[]): Promise<string> {
  return callGroq(messages as any, { temperature: 0.5, maxTokens: 200 });
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

    console.log('[benni-chat] Received message:', JSON.stringify(message));

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message es requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    const now = new Date();
    const currentDate = now.toLocaleDateString('es-SV', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTime = now.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    const systemPrompt = SYSTEM_PROMPT.replace('{CURRENT_DATETIME}', `Hoy es ${currentDate} y la hora actual es ${currentTime}.`);

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
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

    const rawResponse = await benniLLM(messages);
    const parsed = parseGroqResponse(rawResponse);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[benni-chat] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  }
});
