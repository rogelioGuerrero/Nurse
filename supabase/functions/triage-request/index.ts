// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const REQUEST_TIMEOUT_MS = 15000;

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

const SYSTEM_PROMPT = `Eres un sistema de triaje médico para BienCuidar, plataforma de cuidado de salud en El Salvador.

Recibes lo que una familia escribió sobre su familiar que necesita cuidado de enfermería. Tu trabajo es EXTRAER y ESTRUCTURAR la información, NO interpretar ni inventar.

REGLAS ESTRICTAS:
1. Solo usa información EXPLÍCITAMENTE escrita por la familia.
2. Si no se mencionan medicamentos, escribe "no reportado".
3. Si no se mencionan alergias, escribe "no reportado".
4. NO infieras diagnósticos desde síntomas. Solo reproduce lo que la familia dijo.
5. NO inventes condiciones que la familia no mencionó.
6. Si no puedes determinar la especialización con confianza > 0.7, usa "Cuidado general".
7. El nurse_summary debe ser un restate fiel de lo que la familia dijo, reorganizado para que la enfermera lo lea rápido. Máximo 60 palabras.
8. La urgencia se clasifica así:
   - "high": cuidados paliativos, postoperatorio reciente, post ACV, encamado con complicaciones
   - "medium": condiciones crónicas estables que requieren atención continua
   - "low": compañía, acompañamiento, tareas puntuales

ESPECIALIZACIONES VÁLIDAS (usa EXACTAMENTE uno de estos nombres):
- Geriatría
- Demencia y Alzheimer
- Postoperatorio
- Cuidados Paliativos
- Curaciones complejas
- Fisioterapia Básica
- Inyecciones
- Manejo de Sondas
- Monitoreo Cardíaco
- Control de Diabetes
- Nutrición asistida
- Cuidado general

FORMATO DE RESPUESTA (JSON válido, sin markdown):
{
  "specialization_suggested": "uno de los valores válidos",
  "specialization_confidence": 0.0 a 1.0,
  "urgency": "low | medium | high",
  "patient_data": {
    "diagnosis": "lo que la familia dijo, sin inventar",
    "autonomy": "nivel de dependencia basado en lo escrito, o 'no reportado'",
    "allergies": "lo que la familia dijo, o 'no reportado'",
    "medications": "lo que la familia dijo, o 'no reportado'",
    "emergency_contact": "no reportado"
  },
  "nurse_summary": "resumen fiel, máximo 60 palabras"
}`;

interface TriageRequest {
  patient_name: string;
  patient_age_range?: string;
  patient_gender?: string;
  help_needs: string[];
  help_needs_other?: string;
  situation: string;
}

async function callGroq(userContent: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin") || undefined) });
  }

  const origin = req.headers.get("origin") || undefined;

  try {
    const body: TriageRequest = await req.json();

    const userContent = `Datos del paciente:
- Nombre: ${body.patient_name}
- Edad: ${body.patient_age_range || "no especificada"}
- Género: ${body.patient_gender || "no especificado"}

Necesita ayuda con: ${body.help_needs.join(", ")}${body.help_needs_other ? `, ${body.help_needs_other}` : ""}

Situación descrita por la familia:
"${body.situation}"

Genera el triaje en formato JSON.`;

    const rawResponse = await callGroq(userContent);

    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      // If Groq returned non-JSON, return a safe fallback
      return new Response(
        JSON.stringify({
          specialization_suggested: "Cuidado general",
          specialization_confidence: 0.5,
          urgency: "medium",
          patient_data: {
            diagnosis: body.situation.slice(0, 200),
            autonomy: "no reportado",
            allergies: "no reportado",
            medications: "no reportado",
            emergency_contact: "no reportado",
          },
          nurse_summary: body.situation.slice(0, 200),
        }),
        { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("triage-request error:", err.message);
    return new Response(
      JSON.stringify({ error: "triage failed" }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    );
  }
});
