/**
 * Pipeline MoA (Mixture of Agents) — State Graph pattern (LangGraph-style)
 * 
 * 5 agentes con feedback loops, estado compartido y validación por nodo.
 * 
 * Agente 1 (Busca):    Groq Compound busca datos en fuentes autorizadas
 * Agente 2 (Redacta):  GPT-OSS 120b escribe borrador con gancho narrativo
 * Agente 3 (Revisa):   GPT-OSS 120b fact-check + evaluación ética del ángulo
 * Agente 4 (Edita):    GPT-OSS 120b pulido editorial
 * Agente 5 (Aprueba):  GPT-OSS 120b QA final (formato, CTA, hashtags)
 * 
 * Graph:
 *   SEARCH → WRITE → REVIEW → EDIT → APPROVE → TEASER → END
 *              ↑        |         |        |
 *              ← REESCRIBIR        ← RECHAZADO
 *   ← BUSCAR_MAS ─────┘
 * 
 * Uso: node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt "próximo tema"
 * (GROQ_API_KEY se lee automáticamente desde .env si no está en el entorno)
 * Salida: scripts/generated-article.txt + scripts/gemini-prompt.txt
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Cargar .env automáticamente si GROQ_API_KEY no está en el entorno
function loadEnv() {
  if (process.env.GROQ_API_KEY) return;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(__dirname, "..", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    }
  } catch {}
}
loadEnv();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OUTPUT_FILE = "scripts/generated-article.txt";
const GEMINI_PROMPT_FILE = "scripts/gemini-prompt.txt";

const TOPIC = process.argv[2] || "burnout cuidadores adultos mayores";
const ANGLE_RAW = process.argv[3] || "";
const NEXT_TOPIC_RAW = process.argv[4] || "";
const MAX_SEARCH_ITERATIONS = 2;
const MAX_REWRITE_ITERATIONS = 1;
const MAX_EDIT_ITERATIONS = 2;

// Leer ángulo desde archivo si empieza con @ (evita corrupción UTF-8 de PowerShell)
const ANGLE = ANGLE_RAW.startsWith("@")
  ? readFileSync(ANGLE_RAW.slice(1), "utf-8").trim()
  : ANGLE_RAW;

// Leer próximo tema desde archivo si empieza con @
const NEXT_TOPIC = NEXT_TOPIC_RAW.startsWith("@")
  ? readFileSync(NEXT_TOPIC_RAW.slice(1), "utf-8").trim()
  : NEXT_TOPIC_RAW;

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
  console.error("Opciones:");
  console.error('  1. Crear archivo .env con GROQ_API_KEY=gsk_tu_key');
  console.error('  2. O setear: $env:GROQ_API_KEY="gsk_tu_key"');
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
      const json = await res.json();
      const content = json.choices[0]?.message?.content || "";
      if (!content.trim() && attempt < 4) {
        console.log(`  Respuesta vacía de ${model}. Reintentando... (${attempt}/4)`);
        await new Promise((r) => setTimeout(r, 5000 * attempt));
        continue;
      }
      return json;
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

function parseJSONResponse(text) {
  try { return JSON.parse(text); } catch {}
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()); } catch {}
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

function decisionToFeedback(decision) {
  if (!decision) return "";
  const parts = [];
  if (decision.correcciones?.length) parts.push("Correcciones: " + decision.correcciones.join("; "));
  if (decision.datos_faltantes) parts.push("Datos faltantes: " + decision.datos_faltantes);
  if (decision.issues?.length) parts.push("Problemas: " + decision.issues.join("; "));
  if (decision.feedback) parts.push("Feedback: " + decision.feedback);
  if (decision.detalle_datos) parts.push("Detalle: " + decision.detalle_datos);
  return parts.join("\n");
}

// ── Guardrails: validación declarativa por nodo ──
const GUARDRAILS = {
  SEARCH: [
    { check: out => out && out.length > 100, msg: "Research muy corta" },
    { check: out => out && /https?:\/\//.test(out), msg: "No hay URLs de fuentes" },
  ],
  WRITE: [
    { check: out => out && out.length > 200, msg: "Borrador muy corto" },
    { check: out => out && !/\*\*|##/.test(out), msg: "Tiene markdown" },
    { check: out => out && out.includes("biencuidar.agtisa.com"), msg: "Falta CTA" },
  ],
  REVIEW: [
    { check: out => out && out.veredicto !== undefined, msg: "Falta veredicto" },
    { check: out => out && ["APROBADO", "REESCRIBIR", "BUSCAR_MAS"].includes(out.veredicto), msg: "Veredicto inválido" },
  ],
  EDIT: [
    { check: out => out && out.length > 200, msg: "Artículo editado muy corto" },
    { check: out => out && !/\*\*|##/.test(out), msg: "Tiene markdown" },
    { check: out => out && out.includes("biencuidar.agtisa.com"), msg: "Falta CTA" },
  ],
  APPROVE: [
    { check: out => out && out.veredicto !== undefined, msg: "Falta veredicto" },
    { check: out => out && ["APROBADO", "RECHAZADO"].includes(out.veredicto), msg: "Veredicto inválido" },
  ],
  TEASER: [
    { check: out => out && out.length > 20, msg: "Teaser muy corto" },
    { check: out => out && out.length < 200, msg: "Teaser muy largo" },
  ],
};

function runGuardrails(node, output) {
  const rules = GUARDRAILS[node];
  if (!rules) return [];
  return rules.filter(g => !g.check(output)).map(g => g.msg);
}

// ── Router declarativo: transiciones como datos ──
const TRANSITIONS = {
  SEARCH: [{ next: "WRITE" }],
  WRITE:  [{ next: "REVIEW" }],
  REVIEW: [
    {
      condition: s => s.reviewDecision?.veredicto === "BUSCAR_MAS" && s.iterations.search < MAX_SEARCH_ITERATIONS,
      next: "SEARCH",
      action: s => {
        console.log("→ Revisor pide BUSCAR_MAS. Volviendo a SEARCH...\n");
        s.searchFeedback = s.reviewDecision.feedback || s.reviewDecision.datos_faltantes || "";
        s.iterations.search++;
        s.eventLog.push({ ts: new Date().toISOString(), type: "transition", from: "REVIEW", to: "SEARCH", reason: "BUSCAR_MAS" });
      },
    },
    {
      condition: s => s.reviewDecision?.veredicto === "REESCRIBIR" && s.iterations.rewrite < MAX_REWRITE_ITERATIONS,
      next: "WRITE",
      action: s => {
        console.log("→ Revisor pide REESCRIBIR. Volviendo a WRITE...\n");
        s.writeFeedback = s.reviewDecision.feedback || s.reviewDecision.correcciones?.join("; ") || "";
        s.iterations.rewrite++;
        s.eventLog.push({ ts: new Date().toISOString(), type: "transition", from: "REVIEW", to: "WRITE", reason: "REESCRIBIR" });
      },
    },
    {
      condition: () => true,
      next: "EDIT",
      action: s => { s.editFeedback = decisionToFeedback(s.reviewDecision); },
    },
  ],
  EDIT: [{ next: "APPROVE" }],
  APPROVE: [
    {
      condition: s => s.qaDecision?.veredicto === "RECHAZADO" && s.iterations.edit < MAX_EDIT_ITERATIONS,
      next: "EDIT",
      action: s => {
        console.log("→ QA rechazó. Volviendo a EDIT con feedback...\n");
        s.editFeedback = decisionToFeedback(s.qaDecision);
        s.iterations.edit++;
        s.eventLog.push({ ts: new Date().toISOString(), type: "transition", from: "APPROVE", to: "EDIT", reason: "RECHAZADO" });
      },
    },
    { condition: s => !!s.nextTopic, next: "TEASER" },
    { condition: () => true, next: "END" },
  ],
  TEASER: [{ next: "END" }],
};

function resolveTransition(node, state) {
  const rules = TRANSITIONS[node];
  if (!rules) return "END";
  for (const rule of rules) {
    if (!rule.condition || rule.condition(state)) {
      if (rule.action) rule.action(state);
      return rule.next;
    }
  }
  return "END";
}

// ── Helper: plantillas de prompts ──
function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

const PROMPTS = {
  search: `Research the following topic for a healthcare Facebook post: "{topic}". Find real statistics, data, and facts from authoritative health sources. Return: 1) Key statistics with source URLs 2) 2-3 practical recommendations 3) Any relevant data for Latin America. Be concise.{feedback_section}`,

  write: `Eres el redactor jefe de BienCuidar, una plataforma salvadoreña que conecta familias con enfermeras profesionales para cuidado de salud en casa.

Datos de investigación (pueden estar en inglés o francés):
{research}

Redacta un post de Facebook en español sobre: {topic}

{angle}
{feedback_section}
Reglas:
- NO uses markdown (no **negritas**, no ##, no bullets con -)
- Usa 2-3 emojis profesionales (🩺 💙 🌐 🤝 ❤️‍‍🩹)
- Tono empático, profesional y cercano. NO condescendiente. NO suavices el mensaje.
- 150-200 palabras MAXIMO
- Estructura: gancho narrativo + 1 dato real + 1 reflexión o consejo práctico + CTA
- Si los datos están en inglés, tradúcelos al español
- NO inventes estadísticas. Solo usa las que aparecen en la investigación o en el ángulo editorial.
- El gancho debe visibilizar el problema, no sensacionalizarlo
- MANTÉN el tono del ángulo editorial aunque haya feedback del revisor. El feedback corrige datos, no cambia el enfoque narrativo.
- Si el ángulo editorial incluye datos específicos (ej: "70% no cotiza", "13% pensión"), ÚSALOS en el texto. No los omitas.

Termina con: Publicá tu necesidad de cuido en https://biencuidar.agtisa.com
Incluye 3 hashtags al final.

Devuelve SOLO el texto.`,

  review: `Eres un verificador de datos y editor ético de BienCuidar. Compara el borrador con los datos de investigación.

DATOS DE INVESTIGACIÓN:
{research}

BORRADOR:
{draft}

Verifica:
1. ¿Las estadísticas coinciden con la investigación? ¿Hay datos inventados?
2. ¿Hay claims sin fuente? IMPORTANTE: un claim es aceptable si tiene referencia verificable (DOI, URL, nombre de medio/publicación, institución académica o gubernamental). NO rechaces un dato solo porque no esté en la lista de fuentes autorizadas del buscador. The Lancet, Nature, Science, Reuters, BBC, NYT, INEGI, UN Women, Banco Mundial, CEPAL, OIT y publicaciones académicas peer-reviewed son fuentes válidas. Solo marca como "sin fuente" los datos que no tienen NINGUNA referencia identificable.
3. ¿El tono es apropiado para una página de salud profesional?
4. ¿Hay errores médicos o información peligrosa?
5. ¿El ángulo narrativo visibiliza el problema o lo sensacionaliza?
6. ¿Faltan datos importantes que la investigación no cubrió?

Responde EXACTAMENTE como un objeto JSON válido (sin markdown, sin texto antes o después):
{
  "datos_correctos": true,
  "detalle_datos": "explicación breve de qué datos están verificados",
  "datos_inventados": [],
  "angulo": "apropiado",
  "explicacion_angulo": "breve explicación",
  "correcciones": [],
  "datos_faltantes": null,
  "veredicto": "APROBADO",
  "feedback": null
}

Reglas del veredicto:
- "APROBADO": el borrador es correcto, pasa al editor
- "REESCRIBIR": el redactor necesita cambiar el enfoque. Pon instrucciones específicas en "feedback"
- "BUSCAR_MAS": faltan datos importantes. Pon qué buscar en "feedback" y "datos_faltantes"

Si hay correcciones, lista cada una en el array "correcciones".
Si hay datos inventados, lista cada uno en el array "datos_inventados".`,

  edit: `Eres el editor jefe de BienCuidar (plataforma salvadoreña de enfermería en casa).

BORRADOR ACTUAL:
{draft}

REVISIÓN DEL VERIFICADOR:
{review}

Tu trabajo como editor:
1. Aplica las correcciones de datos sugeridas
2. Mejora el flujo narrativo: que la historia respire, que el gancho atrape
3. Corta lo que sobra. 150-200 palabras es el límite.
4. Asegura que el tono sea empático sin ser condescendiente
5. Verifica que el CTA y hashtags estén presentes

Mantén:
- Sin markdown
- 2-3 emojis profesionales
- Termina con: Publicá tu necesidad de cuido en https://biencuidar.agtisa.com
- 3 hashtags al final

Devuelve SOLO el texto final listo para publicar.`,

  approve: `Eres el control de calidad final de BienCuidar. Verifica este post de Facebook:

{finalText}

Evalúa cada punto del checklist y responde EXACTAMENTE como un objeto JSON válido (sin markdown, sin texto antes o después):
{
  "checklist": {
    "espanol": true,
    "sin_markdown": true,
    "palabras_ok": true,
    "emojis_ok": true,
    "cta_ok": true,
    "hashtags_ok": true,
    "datos_verificados": true,
    "tono_ok": true
  },
  "palabras": 180,
  "veredicto": "APROBADO",
  "issues": []
}

Reglas:
- "veredicto" debe ser "APROBADO" o "RECHAZADO"
- Si es "RECHAZADO", lista cada problema en "issues" (ej: ["Falta CTA", "Tiene markdown"])
- "palabras" es el conteo de palabras del post`,

  teaser: `Eres el redactor jefe de BienCuidar (plataforma salvadoreña de enfermería en casa).

ARTÍCULO ACTUAL:
{article}

PRÓXIMO TEMA: {nextTopic}

Genera un teaser de 1-2 líneas (máximo 30 palabras) que:
- Cree expectativa sobre el próximo tema
- Haga una pregunta provocativa que invite a comentar
- Tono conversacional y cercano, NO comercial
- NO incluyas CTA ni hashtags
- NO uses markdown

Ejemplo de formato: "La semana que viene: [pregunta provocativa]. Te leemos en el próximo análisis."

Devuelve SOLO el teaser.`,

  gemini: `Professional healthcare marketing image for BienCuidar, a nursing care platform in El Salvador.

Theme: {topic}

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
{articleContext}`,
};

// ── Esperar entre agentes para evitar rate limit ──
function delay(seconds) {
  console.log(`  Esperando ${seconds}s antes del siguiente agente...`);
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

// ── Agente 1: Compound busca datos ──
async function agentSearch(feedback = null) {
  console.log("[Agente 1/5] Compound buscando en fuentes autorizadas...");
  console.log(`Tema: ${TOPIC}`);
  if (feedback) console.log(`Refinando búsqueda: ${feedback.slice(0, 100)}`);
  console.log(`Fuentes: ${TRUSTED_DOMAINS.join(", ")}`);
  console.log("Esto puede tomar 15-30 segundos...\n");

  const searchPrompt = fillTemplate(PROMPTS.search, {
    topic: TOPIC,
    feedback_section: feedback ? `\n\nADDITIONAL SEARCH NEEDED: ${feedback}` : "",
  });

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

// ── Agente 2: GPT-OSS 120b redacta el borrador con gancho narrativo ──
async function agentWrite(research, feedback = null) {
  console.log("[Agente 2/5] GPT-OSS 120b redactando borrador en español...");
  if (feedback) console.log(`Aplicando feedback: ${feedback.slice(0, 100)}\n`);

  const angle = ANGLE
    ? `ÁNGULO EDITORIAL (definido por el editor humano — SIGUE ESTAS INSTRUCCIONES):
${ANGLE}

INSTRUCCIONES DE USO DEL ÁNGULO:
- GANCHO: abre el post con esta frase o pregunta. Es lo primero que lee el usuario.
- TONO: mantiene esta actitud durante todo el post. No la suavices.
- AUDIENCIA: escribe como si le hablaras a esta persona directamente.
- DATOS_CLAVE: verifica estos datos con la investigación. Si se confirman, úsalos. Si no, busca equivalentes.
- CIERRE: termina el post con esto antes del CTA.`
    : `ÁNGULO EDITORIAL: Busca la historia humana detrás del tema. Empieza con un gancho que haga a la persona detenerse a leer. Por ejemplo: una historia concreta, una pregunta que incomode, un dato que sorprenda. No seas genérico.`;

  const feedbackSection = feedback
    ? `\nFEEDBACK DEL REVISOR (corrige datos o hechos, pero NO suavices el ángulo editorial ni el tono): ${feedback}\n`
    : "";

  const prompt = fillTemplate(PROMPTS.write, {
    research,
    topic: TOPIC,
    angle,
    feedback_section: feedbackSection,
  });

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 600,
    temperature: 0.7,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "");
}

// ── Agente 3: GPT-OSS 120b revisa datos + ética del ángulo ──
async function agentReview(research, draft) {
  console.log("[Agente 3/5] GPT-OSS 120b verificando datos y ángulo...\n");

  const prompt = fillTemplate(PROMPTS.review, { research, draft });

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 800,
    temperature: 0.3,
  });

  const raw = data.choices[0]?.message?.content || "";
  const decision = parseJSONResponse(raw);
  if (!decision) {
    console.log("Revisión (texto plano, fallback):\n" + raw.slice(0, 500) + "\n");
    return { veredicto: "APROBADO", datos_correctos: true, correcciones: [], datos_inventados: [], feedback: raw.slice(0, 200) };
  }
  console.log("Revisión (JSON):\n" + JSON.stringify(decision, null, 2).slice(0, 500) + "\n");
  return decision;
}

// ── Agente 4: GPT-OSS 120b edita según revisión ──
async function agentEdit(draft, review) {
  console.log("[Agente 4/5] GPT-OSS 120b editando según revisión...\n");

  const prompt = fillTemplate(PROMPTS.edit, { draft, review });

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 600,
    temperature: 0.5,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "");
}

// ── Agente 5: GPT-OSS 120b hace QA final ──
async function agentApprove(finalText) {
  console.log("[Agente 5/5] GPT-OSS 120b QA final...\n");

  const prompt = fillTemplate(PROMPTS.approve, { finalText });

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 400,
    temperature: 0.2,
  });

  const raw = data.choices[0]?.message?.content || "";
  const decision = parseJSONResponse(raw);
  if (!decision) {
    console.log("QA (texto plano, fallback):\n" + raw.slice(0, 500) + "\n");
    return { veredicto: raw.includes("RECHAZADO") ? "RECHAZADO" : "APROBADO", checklist: {}, palabras: 0, issues: [raw.slice(0, 200)] };
  }
  console.log("QA Final (JSON):\n" + JSON.stringify(decision, null, 2).slice(0, 500) + "\n");
  return decision;
}

// ── Generar prompt para Gemini Nano Banana ──
function generateGeminiPrompt(article) {
  return fillTemplate(PROMPTS.gemini, {
    topic: TOPIC,
    articleContext: article.slice(0, 300),
  });
}

// ── Generar teaser/cliffhanger para el próximo artículo ──
async function generateTeaser(article, nextTopic) {
  if (!nextTopic) return "";

  console.log("[Teaser] Generando cliffhanger para próximo tema...\n");

  const prompt = fillTemplate(PROMPTS.teaser, {
    article: article.slice(0, 400),
    nextTopic,
  });

  const data = await callGroq("openai/gpt-oss-120b", prompt, {
    max_tokens: 100,
    temperature: 0.8,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "").trim();
}

// ── State Graph: definición del estado compartido ──
// Cada nodo lee lo que necesita, procesa, valida, y escribe su resultado.

class MoAGraph {
  constructor() {
    this.state = {
      topic: TOPIC,
      angle: ANGLE,
      nextTopic: NEXT_TOPIC,
      // Datos que pasan entre agentes
      research: "",           // Agent 1 output (texto de Compound)
      currentDraft: "",       // Borrador actual (texto)
      drafts: [],              // Historial de borradores
      reviewDecision: null,    // Agent 3: { veredicto, datos_correctos, correcciones, datos_faltantes, feedback }
      editedArticle: "",      // Agent 4 output (texto)
      qaDecision: null,        // Agent 5: { veredicto, checklist, palabras, issues }
      teaser: "",             // Teaser output (texto)
      // Feedback para loops
      searchFeedback: null,
      writeFeedback: null,
      editFeedback: null,
      // Contadores de iteración por tipo
      iterations: { search: 0, rewrite: 0, edit: 0 },
      // Metadata
      nodeHistory: [],
      eventLog: [],
    };
    this.t0 = Date.now();
  }

  logNode(node) {
    this.state.nodeHistory.push(node);
    const iter = this.state.iterations;
    const total = iter.search + iter.rewrite + iter.edit;
    console.log(`\n[Nodo: ${node}]${total > 0 ? ` (search:${iter.search} rewrite:${iter.rewrite} edit:${iter.edit})` : ""}`);
    this.logEvent("node_start", { node, iterations: { ...iter } });
  }

  logEvent(type, data = {}) {
    this.state.eventLog.push({ ts: new Date().toISOString(), type, ...data });
  }

  // ── #7 Retry con guardrails: reintenta el agente si la validación falla ──
  async runWithGuardrails(node, agentFn, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const output = await agentFn();
      const errors = runGuardrails(node, output);
      if (errors.length === 0) return output;
      if (attempt < maxRetries) {
        console.log(`  Guardrails fallaron (${errors.join(", ")}). Reintentando ${attempt + 1}/${maxRetries}...`);
        this.logEvent("guardrail_retry", { node, attempt: attempt + 1, errors });
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw new Error(`${node} guardrails (${maxRetries + 1} intentos): ${errors.join(", ")}`);
      }
    }
  }

  // ── Nodo 1: SEARCH ──
  async nodeSearch() {
    this.logNode("SEARCH");
    const research = await this.runWithGuardrails("SEARCH", () => agentSearch(this.state.searchFeedback));
    this.state.research = research;
    this.state.searchFeedback = null;
    this.logEvent("search_done", { researchLen: research.length });
    await delay(15);
    return resolveTransition("SEARCH", this.state);
  }

  // ── Nodo 2: WRITE ──
  async nodeWrite() {
    this.logNode("WRITE");
    const draft = await this.runWithGuardrails("WRITE", () => agentWrite(this.state.research, this.state.writeFeedback));
    this.state.currentDraft = draft;
    this.state.drafts.push(draft);
    this.state.writeFeedback = null;
    this.logEvent("write_done", { draftLen: draft.length, draftCount: this.state.drafts.length });
    await delay(10);
    return resolveTransition("WRITE", this.state);
  }

  // ── Nodo 3: REVIEW ──
  async nodeReview() {
    this.logNode("REVIEW");
    const decision = await this.runWithGuardrails("REVIEW", () => agentReview(this.state.research, this.state.currentDraft));
    this.state.reviewDecision = decision;
    this.logEvent("review_decision", { veredicto: decision.veredicto, correcciones: decision.correcciones?.length || 0, datosInventados: decision.datos_inventados?.length || 0 });
    await delay(10);
    return resolveTransition("REVIEW", this.state);
  }

  // ── Nodo 4: EDIT ──
  async nodeEdit() {
    this.logNode("EDIT");
    const edited = await this.runWithGuardrails("EDIT", () => agentEdit(this.state.currentDraft, this.state.editFeedback || ""));
    this.state.editedArticle = edited;
    this.logEvent("edit_done", { articleLen: edited.length });
    await delay(10);
    return resolveTransition("EDIT", this.state);
  }

  // ── Nodo 5: APPROVE ──
  async nodeApprove() {
    this.logNode("APPROVE");
    const decision = await this.runWithGuardrails("APPROVE", () => agentApprove(this.state.editedArticle));
    this.state.qaDecision = decision;
    this.logEvent("qa_decision", { veredicto: decision.veredicto, palabras: decision.palabras, issues: decision.issues?.length || 0 });
    return resolveTransition("APPROVE", this.state);
  }

  // ── Nodo 6: TEASER (cliffhanger para próximo artículo) ──
  async nodeTeaser() {
    this.logNode("TEASER");
    const teaser = await generateTeaser(this.state.editedArticle, this.state.nextTopic);
    if (teaser) {
      const result = await this.runWithGuardrails("TEASER", async () => teaser);
      this.state.teaser = result;
      this.logEvent("teaser_done", { teaser: result });
      console.log(`Teaser: "${result}"\n`);
    }
    return resolveTransition("TEASER", this.state);
  }

  // ── Runner: ejecuta el grafo ──
  async run() {
    const nodes = {
      SEARCH: () => this.nodeSearch(),
      WRITE: () => this.nodeWrite(),
      REVIEW: () => this.nodeReview(),
      EDIT: () => this.nodeEdit(),
      APPROVE: () => this.nodeApprove(),
      TEASER: () => this.nodeTeaser(),
    };

    let current = "SEARCH";
    let steps = 0;
    const MAX_STEPS = 20; // safety: evitar loops infinitos

    while (current !== "END" && steps < MAX_STEPS) {
      steps++;
      try {
        current = await nodes[current]();
      } catch (err) {
        console.error(`\n✘ Error en nodo ${current}: ${err.message}`);
        const it = this.state.iterations;
        console.error(`  Estado: search=${it.search} rewrite=${it.rewrite} edit=${it.edit}, steps=${steps}`);
        console.error(`  Historial: ${this.state.nodeHistory.join(" → ")}`);
        process.exit(1);
      }
    }

    if (current !== "END") {
      console.error(`\n✘ Loop infinito detectado (${steps} pasos). Abortando.`);
      console.error(`  Historial: ${this.state.nodeHistory.join(" → ")}`);
      process.exit(1);
    }

    // Guardar resultado
    let article = this.state.editedArticle;

    // Insertar teaser antes del CTA si existe
    if (this.state.teaser) {
      const ctaIndex = article.indexOf("Publicá tu necesidad de cuido");
      if (ctaIndex > -1) {
        article = article.slice(0, ctaIndex) + this.state.teaser + "\n" + article.slice(ctaIndex);
      } else {
        article = article + "\n" + this.state.teaser;
      }
    }

    writeFileSync(OUTPUT_FILE, article, "utf-8");

    // Guardar copia histórica
    const date = new Date().toISOString().slice(0, 10);
    const slug = this.state.topic.slice(0, 40).replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const archiveDir = "scripts/articles";
    mkdirSync(archiveDir, { recursive: true });
    const archivePath = `${archiveDir}/${date}_${slug}.txt`;
    writeFileSync(archivePath, article, "utf-8");
    console.log(`Archivo histórico: ${archivePath}`);

    // Guardar event log estructurado
    const elapsedForLog = ((Date.now() - this.t0) / 1000).toFixed(1);
    const logPath = `${archiveDir}/${date}_${slug}.json`;
    writeFileSync(logPath, JSON.stringify({
      topic: this.state.topic,
      nodes: this.state.nodeHistory,
      iterations: this.state.iterations,
      reviewDecision: this.state.reviewDecision,
      qaDecision: this.state.qaDecision,
      teaser: this.state.teaser,
      elapsed: parseFloat(elapsedForLog),
      eventLog: this.state.eventLog,
    }, null, 2), "utf-8");
    console.log(`Event log: ${logPath}`);

    const geminiPrompt = generateGeminiPrompt(article);
    writeFileSync(GEMINI_PROMPT_FILE, geminiPrompt, "utf-8");

    const elapsed = ((Date.now() - this.t0) / 1000).toFixed(1);

    console.log("═══════════════════════════════════════════════════");
    console.log("ARTÍCULO GENERADO (MoA State Graph: 5 agentes + teaser)");
    console.log(`Nodos ejecutados: ${this.state.nodeHistory.join(" → ")}`);
    const it = this.state.iterations;
    console.log(`Iteraciones: search=${it.search} rewrite=${it.rewrite} edit=${it.edit}`);
    if (this.state.teaser) console.log(`Teaser: "${this.state.teaser}"`);
    console.log("═══════════════════════════════════════════════════\n");
    console.log(article);
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
}

// ── Entry point ──
const graph = new MoAGraph();
graph.run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
