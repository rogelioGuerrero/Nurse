// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const SUMMARY_PROMPT = `Eres un analista de soporte. Resume la siguiente conversación de soporte de BienCuidar en formato estructurado.

Responde SOLO en este formato JSON exacto (sin markdown, sin explicaciones):
{"summary": "resumen de 2-3 líneas sobre el tema principal y qué se preguntó", "topics": ["tema1", "tema2"], "resolved": true o false}

- "summary": 2-3 líneas describiendo el tema principal y las preguntas clave.
- "topics": array de palabras clave (máximo 5) sobre los temas consultados.
- "resolved": true si la conversación se resolvió con información, false si se derivó a WhatsApp o quedó sin respuesta.

No inventes información. Si no hay mensajes suficientes, devuelve {"summary": "Sesión sin interacción", "topics": [], "resolved": false}.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ summary: "Sesión sin interacción", topics: [], resolved: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const conversationText = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
      .join("\n");

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          { role: "user", content: conversationText },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { summary: rawContent.substring(0, 200), topics: [], resolved: false };
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: message, summary: null, topics: [], resolved: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
