/**
 * Pipeline MoA (Mixture of Agents) — State Graph pattern (LangGraph-style)
 * 
 * 5 agentes con feedback loops, estado compartido y validación por nodo.
 * 
 * Agente 1 (Busca):    Groq Compound busca datos en fuentes autorizadas
 * Agente 2 (Redacta):  Llama 3.3 70b escribe borrador con gancho narrativo
 * Agente 3 (Revisa):   Llama 3.3 70b fact-check + evaluación ética del ángulo
 * Agente 4 (Edita):    Llama 3.3 70b pulido editorial
 * Agente 5 (Aprueba):  Llama 3.3 70b QA final (formato, CTA, hashtags)
 * 
 * Graph:
 *   SEARCH → WRITE → REVIEW → EDIT → APPROVE → END
 *              ↑        |         |        |
 *              ← REESCRIBIR        ← RECHAZADO
 *   ← BUSCAR_MAS ─────┘
 * 
 * Uso: $env:GROQ_API_KEY="gsk_..."; node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt
 * Salida: scripts/generated-article.txt + scripts/gemini-prompt.txt
 */

import { writeFileSync, readFileSync } from "fs";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OUTPUT_FILE = "scripts/generated-article.txt";
const GEMINI_PROMPT_FILE = "scripts/gemini-prompt.txt";

const TOPIC = process.argv[2] || "burnout cuidadores adultos mayores";
const ANGLE_RAW = process.argv[3] || "";
const MAX_ITERATIONS = 2;

// Leer ángulo desde archivo si empieza con @ (evita corrupción UTF-8 de PowerShell)
const ANGLE = ANGLE_RAW.startsWith("@")
  ? readFileSync(ANGLE_RAW.slice(1), "utf-8").trim()
  : ANGLE_RAW;

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
async function agentSearch(feedback = null) {
  console.log("[Agente 1/5] Compound buscando en fuentes autorizadas...");
  console.log(`Tema: ${TOPIC}`);
  if (feedback) console.log(`Refinando búsqueda: ${feedback.slice(0, 100)}`);
  console.log(`Fuentes: ${TRUSTED_DOMAINS.join(", ")}`);
  console.log("Esto puede tomar 15-30 segundos...\n");

  const basePrompt = `Research the following topic for a healthcare Facebook post: "${TOPIC}". Find real statistics, data, and facts from authoritative health sources. Return: 1) Key statistics with source URLs 2) 2-3 practical recommendations 3) Any relevant data for Latin America. Be concise.`;
  const searchPrompt = feedback
    ? `${basePrompt}\n\nADDITIONAL SEARCH NEEDED: ${feedback}`
    : basePrompt;

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

// ── Agente 2: Llama 3.3 redacta el borrador con gancho narrativo ──
async function agentWrite(research, feedback = null) {
  console.log("[Agente 2/5] Llama 3.3 redactando borrador en español...");
  if (feedback) console.log(`Aplicando feedback: ${feedback.slice(0, 100)}\n`);

  const angle = feedback
    ? `FEEDBACK DEL REVISOR (aplica estos cambios en el ángulo narrativo): ${feedback}`
    : ANGLE
      ? `ÁNGULO EDITORIAL (definido por el editor humano): ${ANGLE}`
      : `ÁNGULO EDITORIAL: Busca la historia humana detrás del tema. Empieza con un gancho que haga a la persona detenerse a leer. Por ejemplo: una historia concreta, una pregunta que incomode, un dato que sorprenda. No seas genérico.`;

  const prompt = `Eres el redactor jefe de BienCuidar, una plataforma salvadoreña que conecta familias con enfermeras profesionales para cuidado de salud en casa.

Datos de investigación (pueden estar en inglés o francés):
${research}

Redacta un post de Facebook en español sobre: ${TOPIC}

${angle}

Reglas:
- NO uses markdown (no **negritas**, no ##, no bullets con -)
- Usa 2-3 emojis profesionales (🩺 💙 🌐 🤝 ❤️‍🩹)
- Tono empático, profesional y cercano. NO condescendiente.
- 150-200 palabras MAXIMO
- Estructura: gancho narrativo + 1 dato real + 1 consejo práctico + CTA
- Si los datos están en inglés, tradúcelos al español
- NO inventes estadísticas. Solo usa las que aparecen en la investigación.
- El gancho debe visibilizar el problema, no sensacionalizarlo

Termina con: Publicá tu necesidad gratis en https://biencuidar.agtisa.com
Incluye 3 hashtags al final.

Devuelve SOLO el texto.`;

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 600,
    temperature: 0.7,
  });

  return cleanMarkdown(data.choices[0]?.message?.content || "");
}

// ── Agente 3: GPT-OSS 120b revisa datos + ética del ángulo ──
async function agentReview(research, draft) {
  console.log("[Agente 3/5] GPT-OSS 120b verificando datos y ángulo...\n");

  const prompt = `Eres un verificador de datos y editor ético de BienCuidar. Compara el borrador con los datos de investigación.

DATOS DE INVESTIGACIÓN:
${research}

BORRADOR:
${draft}

Verifica:
1. ¿Las estadísticas coinciden con la investigación? ¿Hay datos inventados?
2. ¿Hay claims sin fuente?
3. ¿El tono es apropiado para una página de salud profesional?
4. ¿Hay errores médicos o información peligrosa?
5. ¿El ángulo narrativo visibiliza el problema o lo sensacionaliza?
6. ¿Faltan datos importantes que la investigación no cubrió?

Responde EXACTAMENTE en este formato:
- DATOS CORRECTOS: [sí/no] + detalles
- DATOS INVENTADOS: [lista o "ninguno"]
- ÁNGULO NARRATIVO: [apropiado / sensacionalista / genérico] + explicación
- CORRECCIONES SUGERIDAS: [lista específica o "ninguna"]
- DATOS FALTANTES: [qué información falta o "ninguna"]
- VEREDICTO: [APROBADO / REESCRIBIR / BUSCAR_MAS]
  * APROBADO: el borrador es correcto, pasa al editor
  * REESCRIBIR: el redactor necesita cambiar el enfoque (explica qué cambiar)
  * BUSCAR_MAS: faltan datos importantes, el buscador necesita buscar más (explica qué buscar)`;

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 500,
    temperature: 0.3,
  });

  const review = data.choices[0]?.message?.content || "";
  console.log("Revisión:\n" + review.slice(0, 500) + "\n");
  return review;
}

// ── Agente 4: Llama 3.3 edita según revisión ──
async function agentEdit(draft, review) {
  console.log("[Agente 4/5] Llama 3.3 editando según revisión...\n");

  const prompt = `Eres el editor jefe de BienCuidar (plataforma salvadoreña de enfermería en casa).

BORRADOR ACTUAL:
${draft}

REVISIÓN DEL VERIFICADOR:
${review}

Tu trabajo como editor:
1. Aplica las correcciones de datos sugeridas
2. Mejora el flujo narrativo: que la historia respire, que el gancho atrape
3. Corta lo que sobra. 150-200 palabras es el límite.
4. Asegura que el tono sea empático sin ser condescendiente
5. Verifica que el CTA y hashtags estén presentes

Mantén:
- Sin markdown
- 2-3 emojis profesionales
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

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 400,
    temperature: 0.2,
  });

  const qa = data.choices[0]?.message?.content || "";
  console.log("QA Final:\n" + qa.slice(0, 500) + "\n");
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

// ── State Graph: definición del estado compartido ──
// Cada nodo lee lo que necesita, procesa, valida, y escribe su resultado.

class MoAGraph {
  constructor() {
    this.state = {
      topic: TOPIC,
      angle: ANGLE,
      research: "",
      draft: "",
      review: "",
      editedArticle: "",
      qaResult: "",
      iteration: 1,
      searchFeedback: null,
      writeFeedback: null,
      rewriteCount: 0,
      nodeHistory: [],
    };
    this.t0 = Date.now();
  }

  logNode(node) {
    this.state.nodeHistory.push(node);
    console.log(`\n[Nodo: ${node}] (iteración ${this.state.iteration}/${MAX_ITERATIONS})`);
  }

  // ── Validación: cada nodo valida su output ──
  validate(node, output, minLen, mustInclude = []) {
    if (!output || output.length < minLen) {
      throw new Error(`Agente ${node}: output inválido (len=${output?.length || 0}, mínimo=${minLen})`);
    }
    for (const s of mustInclude) {
      if (!output.includes(s)) {
        throw new Error(`Agente ${node}: output no contiene "${s}"`);
      }
    }
    return true;
  }

  // ── Nodo 1: SEARCH ──
  async nodeSearch() {
    this.logNode("SEARCH");
    const research = await agentSearch(this.state.searchFeedback);
    this.validate("SEARCH", research, 100);
    this.state.research = research;
    this.state.searchFeedback = null;
    await delay(15);
    return "WRITE";
  }

  // ── Nodo 2: WRITE ──
  async nodeWrite() {
    this.logNode("WRITE");
    const draft = await agentWrite(this.state.research, this.state.writeFeedback);
    this.validate("WRITE", draft, 200);
    this.state.draft = draft;
    this.state.writeFeedback = null;
    await delay(10);
    return "REVIEW";
  }

  // ── Nodo 3: REVIEW ──
  async nodeReview() {
    this.logNode("REVIEW");
    const review = await agentReview(this.state.research, this.state.draft);
    this.validate("REVIEW", review, 50, ["VEREDICTO:"]);
    this.state.review = review;
    console.log("Revisión:\n" + review.slice(0, 500) + "\n");
    await delay(10);

    // Router: decidir siguiente nodo según veredicto
    if (review.includes("BUSCAR_MAS") && this.state.iteration < MAX_ITERATIONS) {
      console.log("→ Revisor pide BUSCAR_MAS. Volviendo a SEARCH...\n");
      this.state.searchFeedback = review;
      this.state.iteration++;
      return "SEARCH";
    }
    if (review.includes("REESCRIBIR") && this.state.iteration < MAX_ITERATIONS && this.state.rewriteCount < 1) {
      console.log("→ Revisor pide REESCRIBIR. Volviendo a WRITE...\n");
      this.state.writeFeedback = review;
      this.state.rewriteCount++;
      return "WRITE";
    }
    // APROBADO o sin feedback disponible → pasar a EDIT
    return "EDIT";
  }

  // ── Nodo 4: EDIT ──
  async nodeEdit() {
    this.logNode("EDIT");
    const edited = await agentEdit(this.state.draft, this.state.review);
    this.validate("EDIT", edited, 200, ["biencuidar.agtisa.com"]);
    this.state.editedArticle = edited;
    await delay(10);
    return "APPROVE";
  }

  // ── Nodo 5: APPROVE ──
  async nodeApprove() {
    this.logNode("APPROVE");
    const qa = await agentApprove(this.state.editedArticle);
    this.validate("APPROVE", qa, 50, ["VEREDICTO:"]);
    this.state.qaResult = qa;
    console.log("QA Final:\n" + qa.slice(0, 500) + "\n");

    // Router: si QA rechaza, volver a EDIT con feedback
    if (qa.includes("RECHAZADO") && this.state.iteration < MAX_ITERATIONS) {
      console.log("→ QA rechazó. Volviendo a EDIT con feedback...\n");
      this.state.review = qa; // el editor usa esto como feedback
      this.state.iteration++;
      return "EDIT";
    }

    return "END";
  }

  // ── Runner: ejecuta el grafo ──
  async run() {
    const nodes = {
      SEARCH: () => this.nodeSearch(),
      WRITE: () => this.nodeWrite(),
      REVIEW: () => this.nodeReview(),
      EDIT: () => this.nodeEdit(),
      APPROVE: () => this.nodeApprove(),
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
        console.error(`  Estado: iteration=${this.state.iteration}, steps=${steps}`);
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
    const article = this.state.editedArticle;
    writeFileSync(OUTPUT_FILE, article, "utf-8");

    const geminiPrompt = generateGeminiPrompt(article);
    writeFileSync(GEMINI_PROMPT_FILE, geminiPrompt, "utf-8");

    const elapsed = ((Date.now() - this.t0) / 1000).toFixed(1);

    console.log("═══════════════════════════════════════════════════");
    console.log("ARTÍCULO GENERADO (MoA State Graph: 5 agentes)");
    console.log(`Nodos ejecutados: ${this.state.nodeHistory.join(" → ")}`);
    console.log(`Iteraciones: ${this.state.iteration}`);
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
