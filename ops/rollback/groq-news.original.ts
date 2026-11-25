// @ts-nocheck — Deno Edge Function: Groq Compound News Generator
// Refactor: prompts separados, guardrails, cleanMarkdown, retry en respuestas vacias

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Helper: limpiar markdown residual ──
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ");
}

// ── Helper: plantillas de prompts ──
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

const PROMPTS = {
  search: `Research the following topic for a healthcare Facebook post: "{topic}". Find real statistics, data, and facts from authoritative health sources. Return: 1) Key statistics with source URLs 2) 2-3 practical recommendations 3) Any relevant data for Latin America. Be concise.`,

  write: `Eres el redactor jefe de BienCuidar, una plataforma que conecta familias con enfermeras profesionales para cuidado de salud en casa.

Datos de investigación (pueden estar en inglés o francés):
{research}

Redacta un post de Facebook en español sobre: {topic}

Reglas:
- NO uses markdown (no **negritas**, no ##, no bullets con -)
- Usa 2-3 emojis profesionales (🩺 💙 🌐 🤝 ❤️‍🩹)
- Tono empático, profesional y cercano. NO condescendiente.
- 150-200 palabras MAXIMO
- Estructura: gancho narrativo + 1 dato real + 1 reflexión o consejo práctico + CTA
- Si los datos están en inglés, tradúcelos al español
- NO inventes estadísticas. Solo usa las que aparecen en la investigación.
- El gancho debe visibilizar el problema, no sensacionalizarlo

Termina con: {cta}
Incluye 3 hashtags al final.

Devuelve SOLO el texto.`,
};

// ── Guardrails: validación declarativa ──
const GUARDRAILS = [
  { check: (out: string) => out && out.length > 200, msg: "Artículo muy corto" },
  { check: (out: string) => out && !/\*\*|##/.test(out), msg: "Tiene markdown" },
  { check: (out: string) => out && out.includes("biencuidar.agtisa.com"), msg: "Falta CTA" },
];

function runGuardrails(output: string): string[] {
  return GUARDRAILS.filter(g => !g.check(output)).map(g => g.msg);
}

// ── Helper: llamar a Groq con retry ──
async function callGroq(model: string, prompt: string, opts: Record<string, any> = {}): Promise<any> {
  const body = { model, messages: [{ role: "user", content: prompt }], ...opts };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      const content = json.choices[0]?.message?.content || "";
      if (!content.trim() && attempt < 4) {
        console.log(`[groq-news] Respuesta vacía de ${model}. Reintentando... (${attempt}/4)`);
        await new Promise((r) => setTimeout(r, 5000 * attempt));
        continue;
      }
      return json;
    }

    if (res.status === 429 && attempt < 4) {
      const errText = await res.text();
      const match = errText.match(/try again in ([\d.]+)s/i);
      const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 35;
      console.log(`[groq-news] Rate limit (429). Esperando ${waitSec}s... (${attempt}/4)`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    const err = await res.text();
    throw new Error(`${model}: ${res.status} — ${err.slice(0, 200)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = await req.json();
    const topic = body.topic || "burnout cuidadores adultos mayores";
    const cta = body.cta || "Publicá tu necesidad de cuido en https://biencuidar.agtisa.com";

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Paso 1: Compound busca datos ──
    const searchPrompt = fillTemplate(PROMPTS.search, { topic });
    const TRUSTED_DOMAINS = ["who.int", "paho.org", "mayoclinic.org", "nih.gov", "cdc.gov", "alz.org", "cepal.org", "worldbank.org", "pubmed.ncbi.nlm.nih.gov", "scielo.org"];

    let research = "";
    let toolsUsed: any[] = [];
    let modelUsed = "";

    const compoundModels = ["groq/compound", "compound-beta", "groq/compound-mini", "compound-beta-mini"];
    let compoundSuccess = false;
    let lastError = "";

    for (const model of compoundModels) {
      console.log(`[groq-news] Trying model: ${model}`);
      try {
        const data = await callGroq(model, searchPrompt, {
          max_tokens: 800,
          temperature: 0.7,
          search_settings: { include_domains: TRUSTED_DOMAINS },
        });

        research = data.choices[0]?.message?.content || "";
        const cc = data.choices[0]?.message?.compound_custom;
        if (cc?.executed_tools) {
          toolsUsed = cc.executed_tools.map((t: any) => ({
            type: t.type || t.name || "unknown",
            query: t.query || t.input || "",
          }));
        }
        modelUsed = model;
        compoundSuccess = true;
        console.log(`[groq-news] Compound success: ${research.length} chars, ${toolsUsed.length} tools`);
        break;
      } catch (e: any) {
        lastError = e.message;
        console.log(`[groq-news] ${lastError}`);
      }
    }

    // ── Paso 2: Llama redacta el post ──
    const writePrompt = fillTemplate(PROMPTS.write, { research, topic, cta });
    const writeModel = compoundSuccess ? "llama-3.3-70b-versatile" : "llama-3.3-70b-versatile";

    let article = "";
    let writeSuccess = false;

    for (let attempt = 0; attempt <= 2; attempt++) {
      const data = await callGroq(writeModel, writePrompt, {
        max_tokens: 600,
        temperature: 0.7,
      });

      article = cleanMarkdown(data.choices[0]?.message?.content || "");
      const errors = runGuardrails(article);

      if (errors.length === 0) {
        writeSuccess = true;
        console.log(`[groq-news] Write success: ${article.length} chars`);
        break;
      }

      if (attempt < 2) {
        console.log(`[groq-news] Guardrails fallaron (${errors.join(", ")}). Reintentando ${attempt + 1}/2...`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (!writeSuccess) {
      // Último intento sin guardrails — devolver lo que tengamos
      if (!article) {
        return new Response(JSON.stringify({
          error: `No se pudo generar el artículo. Last: ${lastError}`,
        }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      console.log(`[groq-news] Guardrails fallaron pero devolviendo resultado final`);
    }

    return new Response(JSON.stringify({
      success: true,
      article,
      toolsUsed,
      model: modelUsed,
      writeModel,
      topic,
      researchLen: research.length,
      guardrailsPassed: writeSuccess,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Error desconocido";
    console.error(`[groq-news] Exception: ${errMsg}`);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
