/**
 * Pipeline MoA (Mixture of Agents) — 5 agentes para contenido de Facebook
 * 
 * Agente 1 (Busca):    Groq Compound busca datos en fuentes autorizadas
 * Agente 2 (Redacta):  Llama 3.3 70b escribe el borrador en español
 * Agente 3 (Revisa):   GPT-OSS 120b verifica datos contra la investigación
 * Agente 4 (Edita):    Llama 3.3 70b corrige tono, formato y longitud
 * Agente 5 (Aprueba):  GPT-OSS 20b hace QA final (formato, CTA, hashtags)
 * 
 * Uso: $env:GROQ_API_KEY="gsk_..."; node scripts/groq-news.mjs [tema]
 * Salida: scripts/generated-article.txt + scripts/gemini-prompt.txt
 */

import { writeFileSync } from "fs";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OUTPUT_FILE = "scripts/generated-article.txt";
const GEMINI_PROMPT_FILE = "scripts/gemini-prompt.txt";

const TOPIC = process.argv[2] || "burnout cuidadores adultos mayores";

// Fuentes autorizadas para búsqueda web
const TRUSTED_DOMAINS = [
  "who.int",
  "paho.org",
  "mayoclinic.org",
  "nih.gov",
  "cdc.gov",
  "alz.org",
  "cepal.org",
  "worldbank.org",
  "pubmed.ncbi.nlm.nih.gov",
  "scielo.org",
];

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY no encontrada.");
  console.error('Setear: $env:GROQ_API_KEY="gsk_tu_key"');
  process.exit(1);
}

// ── Helper: llamar a Groq con retry automático ──
async function callGroq(model, prompt, opts = {}) {
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
      return await res.json();
    }

    if (res.status === 429 && attempt < 4) {
      const errText = await res.text();
      const match = errText.match(/try again in ([\d.]+)s/i);
      const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 35;
      console.log(`  Rate limit (429). Esperando ${waitSec}s... (intento ${attempt}/4)`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    const err = await res.text();
    console.error(`Error ${model}: ${res.status}`);
    console.error(err.slice(0, 500));
    process.exit(1);
  }
}

function cleanMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ");
}

// ── Esperar entre agentes para evitar rate limit ──
function delay(seconds) {
  console.log(`  Esperando ${seconds}s antes del siguiente agente...`);
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

// ── Agente 1: Compound busca datos ──
async function agentSearch() {
  console.log("[Agente 1/5] Compound buscando en fuentes autorizadas...");
  console.log(`Tema: ${TOPIC}`);
  console.log(`Fuentes: ${TRUSTED_DOMAINS.join(", ")}`);
  console.log("Esto puede tomar 15-30 segundos...\n");

  const searchPrompt = `Research the following topic for a healthcare Facebook post: "${TOPIC}". Find real statistics, data, and facts from authoritative health sources. Return: 1) Key statistics with source URLs 2) 2-3 practical recommendations 3) Any relevant data for Latin America. Be concise.`;

  const data = await callGroq("groq/compound", searchPrompt, {
    search_settings: { include_domains: TRUSTED_DOMAINS },
    compound_custom: {
      models: {
        reasoning_model: "openai/gpt-oss-120b",
        answering_model: "openai/gpt-oss-120b",
      },
      tools: { enabled_tools: ["web_search"] },
    },
  });

  const research = data.choices[0]?.message?.content || "";
  const tools = data.choices[0]?.message?.executed_tools || [];

  if (tools.length > 0) {
    console.log("Búsquedas realizadas:");
    tools.forEach((t, i) => {
      try {
        const args = JSON.parse(t.arguments);
        console.log(`  ${i + 1}. ${t.type}: ${(args.query || "").slice(0, 80)}`);
      } catch {
        console.log(`  ${i + 1}. ${t.type}`);
      }
    });
    console.log("");
  }

  return research;
}

// ── Agente 2: Llama 3.3 redacta el borrador ──
async function agentWrite(research) {
  console.log("[Agente 2/5] Llama 3.3 redactando borrador en español...\n");

  const prompt = `Eres el redactor de contenido de BienCuidar, una plataforma salvadoreña que conecta familias con enfermeras profesionales para cuidado de salud en casa.

Datos de investigación (pueden estar en inglés o francés):
${research}

Redacta un post de Facebook en español sobre: ${TOPIC}

Reglas:
- NO uses markdown (no **negritas**, no ##, no bullets con -)
- Usa 2-3 emojis profesionales (🩺 💙 🌐 🤝 ❤️‍🩹)
- Tono empático, profesional y cercano
- 150-200 palabras MAXIMO
- Estructura: 1 párrafo gancho + 1 dato real + 1 consejo + CTA
- Si los datos están en inglés, tradúcelos al español
- NO inventes estadísticas. Solo usa las que aparecen en la investigación.

Termina con: Publicá tu necesidad gratis en https://biencuidar.agtisa.com
Incluye 3 hashtags al final.

Devuelve SOLO el texto.`;

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 600,
    temperature: 0.7,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "");
}

// ── Agente 3: GPT-OSS 120b revisa datos ──
async function agentReview(research, draft) {
  console.log("[Agente 3/5] GPT-OSS 120b verificando datos...\n");

  const prompt = `Eres un verificador de datos (fact-checker). Compara el borrador con los datos de investigación.

DATOS DE INVESTIGACIÓN:
${research}

BORRADOR:
${draft}

Verifica:
1. ¿Las estadísticas del borrador coinciden con la investigación? ¿Hay datos inventados?
2. ¿Hay claims sin fuente?
3. ¿El tono es apropiado para una página de salud profesional?
4. ¿Hay errores médicos o información peligrosa?

Responde en formato:
- DATOS CORRECTOS: [sí/no] + detalles
- DATOS INVENTADOS: [lista o "ninguno"]
- CORRECCIONES SUGERIDAS: [lista específica de cambios o "ninguna"]
- VEREDICTO: [APROBADO / REQUIERE_CAMBIOS]`;

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 500,
    temperature: 0.3,
  });

  const review = data.choices[0]?.message?.content || "";
  console.log("Revisión:\n" + review.slice(0, 400) + "\n");
  return review;
}

// ── Agente 4: Llama 3.3 edita según revisión ──
async function agentEdit(draft, review) {
  console.log("[Agente 4/5] Llama 3.3 editando según revisión...\n");

  const prompt = `Eres el editor de contenido de BienCuidar (plataforma salvadoreña de enfermería en casa).

BORRADOR ACTUAL:
${draft}

REVISIÓN DEL VERIFICADOR:
${review}

Aplica las correcciones sugeridas y entrega la versión final. Mantén:
- 150-200 palabras máximo
- Sin markdown
- 2-3 emojis profesionales
- Tono empático y profesional
- Termina con: Publicá tu necesidad gratis en https://biencuidar.agtisa.com
- 3 hashtags al final

Devuelve SOLO el texto final listo para publicar.`;

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 600,
    temperature: 0.5,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "");
}

// ── Agente 5: GPT-OSS 20b hace QA final ──
async function agentApprove(finalText) {
  console.log("[Agente 5/5] GPT-OSS 20b QA final...\n");

  const prompt = `Eres el control de calidad final de BienCuidar. Verifica este post de Facebook:

${finalText}

Checklist (responde sí/no a cada uno):
1. ¿Está en español?
2. ¿No tiene markdown (**, ##, -)?
3. ¿Tiene 150-200 palabras?
4. ¿Tiene 2-3 emojis profesionales?
5. ¿Termina con "Publicá tu necesidad gratis en https://biencuidar.agtisa.com"?
6. ¿Tiene 3 hashtags?
7. ¿No tiene datos inventados (dice "según" o cita fuente)?
8. ¿Tono profesional y empático?

Responde:
- CHECKLIST: [sí/no por cada punto]
- PALABRAS: [conteo]
- VEREDICTO: [APROBADO / RECHAZADO]
- SI RECHAZADO, explica qué falta.`;

  const data = await callGroq("openai/gpt-oss-20b", prompt, {
    max_tokens: 400,
    temperature: 0.2,
  });

  const qa = data.choices[0]?.message?.content || "";
  console.log("QA Final:\n" + qa.slice(0, 400) + "\n");
  return qa;
}

// ── Generar prompt para Gemini Nano Banana ──
function generateGeminiPrompt(article) {
  return `Professional healthcare marketing image for BienCuidar, a nursing care platform in El Salvador.

Theme: ${TOPIC}

Style requirements:
- Professional, warm and trustworthy medical/healthcare aesthetic
- Soft natural lighting, clean composition
- Colors: medical blue (#2563eb) and soft white as primary palette
- Show a caring scene: a professional nurse or family caregiver with an elderly person, warm interaction
- Photorealistic style, not cartoon or illustration
- NO text in the image except: "BienCuidar" in clean modern font at bottom-right corner
- Include URL "biencuidar.agtisa.com" in small text below the BienCuidar logo
- Image should work as a Facebook post image (1200x1200 square or 1200x630 landscape)
- Convey empathy, professionalism and trust
- Latin American setting if people are shown

Article context (for visual inspiration):
${article.slice(0, 300)}`;
}

// ── Pipeline principal ──
async function run() {
  const t0 = Date.now();

  // Agente 1: Buscar
  const research = await agentSearch();
  await delay(15);

  // Agente 2: Redactar
  const draft = await agentWrite(research);
  await delay(10);

  // Agente 3: Revisar
  const review = await agentReview(research, draft);
  await delay(10);

  // Agente 4: Editar
  let finalArticle = await agentEdit(draft, review);
  await delay(10);

  // Agente 5: QA
  const qa = await agentApprove(finalArticle);

  // Si QA rechaza, intentar una edición más
  if (qa.includes("RECHAZADO")) {
    console.log("QA rechazó. Intentando una corrección más...\n");
    finalArticle = await agentEdit(finalArticle, qa);
  }

  if (!finalArticle) {
    console.error("Error: No se generó artículo");
    process.exit(1);
  }

  // Guardar
  writeFileSync(OUTPUT_FILE, finalArticle, "utf-8");

  // Generar prompt Gemini
  const geminiPrompt = generateGeminiPrompt(finalArticle);
  writeFileSync(GEMINI_PROMPT_FILE, geminiPrompt, "utf-8");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("═══════════════════════════════════════════════════");
  console.log("ARTÍCULO GENERADO (MoA: 5 agentes)");
  console.log("═══════════════════════════════════════════════════\n");
  console.log(finalArticle);
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`Tiempo total: ${elapsed}s`);
  console.log(`Artículo guardado en: ${OUTPUT_FILE}`);
  console.log(`Prompt Gemini guardado en: ${GEMINI_PROMPT_FILE}`);
  console.log("\nPRÓXIMOS PASOS:");
  console.log("1. Revisa el artículo en scripts/generated-article.txt");
  console.log("2. Copia el prompt de scripts/gemini-prompt.txt");
  console.log("3. Genera la imagen en Gemini Nano Banana con ese prompt");
  console.log('4. Publica con: node scripts/fb-post.mjs "<ruta-imagen>" @scripts/generated-article.txt');
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
