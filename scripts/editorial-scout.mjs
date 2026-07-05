/**
 * Editorial Scout — Explora 5 dominios del cuidado/enfermería/ancianidad
 * y propone líneas editoriales con gancho noticioso para Facebook.
 *
 * Paso previo al pipeline MoA (groq-news.mjs).
 *
 * Arquitectura de 3 fases:
 * 1. SCAN:    Compound busca en 4 dominios fijos (web search, ~20s c/u)
 * 2. DIGEST:  Qwen3-32B destila cada dominio a 3 datos clave con fecha
 * 3. PROPOSE: Llama 3.3 70B sintetiza los 4 digests + artículos publicados + serie
 *             y propone 3-5 líneas editoriales con datos específicos
 *
 * Los 5 dominios fijos (vigas maestras):
 *   D1 — Innovación y modelos: startups, apps, fintech, care-tech, inversión
 *   D2 — Política pública y derechos: legislación, pensiones, reformas 2026
 *   D3 — Mercado laboral de cuidado: oferta/demanda, salarios, migración, escasez
 *   D4 — Economía familiar: gasto de bolsillo, costo de oportunidad, género
 *   D5 — Salud clínica y envejecimiento: demencia, caídas, polifarmacia, nuevos datos
 *
 * Uso: node scripts/editorial-scout.mjs
 * (GROQ_API_KEY se lee automáticamente desde .env si no está en el entorno)
 * Salida: scripts/editorial-proposals.txt
 */

import { writeFileSync, readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

// ── Cargar .env ──
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
const OUTPUT_FILE = "scripts/editorial-proposals.txt";
const ANGLE_FILE = "scripts/editorial-angle.txt";
const ARTICLES_DIR = "scripts/articles";

// ── 4 dominios fijos (vigas maestras) ──
// D1 (Innovación) eliminado: Compound no encuentra suficiente material sobre care-tech
// D5 (Salud clínica) eliminado: rate limit severo + datos mezclados con otros dominios
const DOMAINS = [
  {
    id: "D2",
    name: "Política pública y derechos",
    question: "¿Qué hace el Estado por el cuidado?",
    prompt: "Find 2026 news about elderly care policies, pension reforms, caregiver rights legislation, long-term care laws, or government programs for aging populations globally and in Latin America. Return specific facts with dates and sources. Be concise.",
    tools: ["web_search"],
  },
  {
    id: "D3",
    name: "Mercado laboral de cuidado",
    question: "¿Hay quien cuide? ¿En qué condiciones?",
    prompt: "Find 2026 news about nursing shortage, caregiver labor market, wages, migration of healthcare workers, supply and demand of home care services, or working conditions of caregivers. Return specific facts with dates and sources. Be concise.",
    tools: ["web_search"],
  },
  {
    id: "D4",
    name: "Economía familiar",
    question: "¿Qué le cuesta a la familia el cuidado?",
    prompt: "Find 2026 news about family spending on elderly care, out-of-pocket healthcare costs, financial impact on caregivers, gender gap in caregiving, lost income, or economic burden of informal care. Return specific facts with dates and sources. Be concise.",
    tools: ["web_search"],
  },
  {
    id: "D6",
    name: "Cuidador informal, género y demografía",
    question: "¿Quién cuida? ¿Qué costo personal paga? ¿Qué dicen los datos poblacionales?",
    prompt: "Find recent data about informal caregivers: who provides unpaid care (gender, age), young people not in education or employment (NEET/Nini) who end up as caregivers, demographic projections for aging populations in Latin America, labor force participation gaps for caregivers, and gender disparities in unpaid care work. Return specific facts with dates and sources. Be concise.",
    tools: ["web_search", "wolfram_alpha"],
  },
];

// ── Serie de contenido de BienCuidar (hilo de Ariadna) ──
const CONTENT_SERIES = [
  "1. Burnout del cuidador ✅",
  "2. ¿Quién jubila a la hija que cuida a sus padres? ✅ (ángulo de María)",
  "3. 50+ sin plan de vejez — ¿preparándonos o esperando joder a alguien gratis? ✅",
  "4. Pirámide poblacional de El Salvador — el tsunami demográfico",
  "5. ¿Hay política pública de cuidado en SV? — decidir sin datos",
  "6. Costo real del cuidado informal — el subsidio invisible al Estado",
  "7. Cuidador sándwich — los que cuidan arriba y abajo",
  "8. Salud mental del cuidador",
  "9. Prevención de caídas en casa",
  "10. Señales de deterioro cognitivo",
  "11. Medicación segura (polifarmacia)",
  "12. Nutrición en adultos mayores",
  "13. Cómo hablar con la familia sobre cuidado de padres",
  "14. Señales de que tu familiar necesita una enfermera",
  "15. Diferencia entre cuidador informal y enfermera profesional",
  "16. Cuidados paliativos",
];

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY no encontrada.");
  console.error('  1. Crear archivo .env con GROQ_API_KEY=gsk_tu_key');
  console.error('  2. O setear: $env:GROQ_API_KEY="gsk_tu_key"');
  process.exit(1);
}

// ── Helper: llamar a Groq con retry ──
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

    if (res.ok) return await res.json();

    if (res.status === 429 && attempt < 4) {
      const errText = await res.text();
      const match = errText.match(/try again in ([\d.]+)s/i);
      const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 35;
      console.log(`  Rate limit (429). Esperando ${waitSec}s... (intento ${attempt}/4)`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (res.status === 413) {
      console.error(`  Error 413 (prompt demasiado largo para Compound). Saltando...`);
      return null;
    }

    const err = await res.text();
    console.error(`Error ${model}: ${res.status}`);
    console.error(err.slice(0, 300));
    return null;
  }
  return null;
}

function delay(seconds, msg = "") {
  if (msg) console.log(`  ${msg}`);
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

// ── Leer artículos ya publicados ──
function getPublishedArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(".txt", ""))
    .sort();
}

// ═══════════════════════════════════════════════════════════════
// FASE 1: SCAN — Compound busca en cada dominio
// ═══════════════════════════════════════════════════════════════
async function scanDomains() {
  console.log("═══════════════════════════════════════════════════");
  console.log("FASE 1: SCAN — 5 dominios (Compound web search)");
  console.log("═══════════════════════════════════════════════════\n");

  const results = [];

  for (let i = 0; i < DOMAINS.length; i++) {
    const dom = DOMAINS[i];
    console.log(`[${dom.id}] ${dom.name}`);
    console.log(`  Pregunta: ${dom.question}`);
    console.log("  Compound buscando... (15-30s)\n");

    const data = await callGroq("groq/compound", dom.prompt, {
      compound_custom: {
        models: {
          reasoning_model: "openai/gpt-oss-120b",
          answering_model: "openai/gpt-oss-120b",
        },
        tools: { enabled_tools: dom.tools },
      },
    });

    if (data) {
      const content = data.choices[0]?.message?.content || "";
      const tools = data.choices[0]?.message?.executed_tools || [];
      console.log(`  ✓ ${content.length} chars, ${tools.length} búsquedas web`);
      results.push({ ...dom, raw: content });
    } else {
      console.log(`  ✗ Sin resultados (error o rate limit)`);
      results.push({ ...dom, raw: "" });
    }

    if (i < DOMAINS.length - 1) {
      await delay(35, `Esperando antes del siguiente dominio...`);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// FASE 2: DIGEST — Llama 3.3 destila cada dominio a 3 datos clave
// ═══════════════════════════════════════════════════════════════
async function digestDomain(domain) {
  if (!domain.raw) {
    return { ...domain, digest: "Sin datos encontrados en este dominio." };
  }

  const prompt = `Eres un analista editorial de BienCuidar (plataforma salvadoreña de enfermería en casa).

Recibiste el resultado de una búsqueda web sobre el dominio: "${domain.name}".
Pregunta guía: ${domain.question}

MATERIAL CRUDO DE LA BÚSQUEDA:
${domain.raw}

Tu trabajo: extraer los 3 datos o hallazgos más relevantes para BienCuidar. Para cada uno:

1. **HECHO**: qué dijo/fue/publicado (1-2 líneas, concreto)
2. **FECHA**: cuándo pasó (mes/año, o "fecha no especificada" si no se sabe)
3. **FUENTE**: quién lo dijo (organización, medio, institución + URL si está disponible)
4. **CONFIABILIDAD**: alta (URL real + medio concreto + fecha verificable) / media (medio concreto pero sin URL o fecha imprecisa) / baja ("informe reciente" sin medio específico, fecha alucinada, o sin fuente verificable)
5. **RELEVANCIA BIENCUIDAR**: por qué importa a familias/enfermeras salvadoreñas (1 línea)

Descarta:
- Datos sin fecha identificable (más viejos que 2025)
- Datos de países desarrollados sin conexión a LatAm/SV (a menos que sean tendencia global clara)
- Promociones de productos específicos (no es publicidad)
- Datos con fecha imposible (posterior a julio 2026)

Devuelve SOLO los 3 datos en este formato:

DATO 1:
- HECHO: ...
- FECHA: ...
- FUENTE: ...
- CONFIABILIDAD: alta/media/baja + razón
- RELEVANCIA: ...

DATO 2:
...

DATO 3:
...`;

  const data = await callGroq("qwen/qwen3-32b", prompt, {
    max_tokens: 600,
    temperature: 0.3,
  });

  const digest = data?.choices[0]?.message?.content || "Error en digestión.";
  console.log(`  ✓ Digest: ${digest.length} chars`);
  return { ...domain, digest };
}

async function digestAll(scanResults) {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("FASE 2: DIGEST — Destilando cada dominio (Llama 3.3)");
  console.log("═══════════════════════════════════════════════════\n");

  const digests = [];
  for (let i = 0; i < scanResults.length; i++) {
    const dom = scanResults[i];
    console.log(`[${dom.id}] ${dom.name}`);
    const d = await digestDomain(dom);
    digests.push(d);
  }

  return digests;
}

// ═══════════════════════════════════════════════════════════════
// FASE 3: PROPOSE — Síntesis editorial final
// ═══════════════════════════════════════════════════════════════
async function proposeEditorialLines(digests) {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("FASE 3: PROPOSE — Síntesis editorial (Llama 3.3)");
  console.log("═══════════════════════════════════════════════════\n");

  const published = getPublishedArticles();
  console.log(`Artículos publicados: ${published.length}`);
  published.forEach((a) => console.log(`  - ${a}`));
  console.log("");

  const digestsText = digests
    .map((d) => `### ${d.id} — ${d.name}\nPregunta: ${d.question}\n\n${d.digest}`)
    .join("\n\n---\n\n");

  const prompt = `Eres el director editorial de BienCuidar, una plataforma salvadoreña que conecta familias con enfermeras profesionales para cuidado de salud en casa.

Recibes digests de 4 dominios de observación del mundo del cuidado. Tu trabajo: cruzar los dominios y proponer líneas editoriales para publicaciones de Facebook.

Los dominios activos son SOLO: D2, D3, D4, D6. NO existe D1 ni D5. NO inventes referencias a dominios que no están en los digests.

## DIGESTS DE LOS 4 DOMINIOS

${digestsText}

## ARTÍCULOS YA PUBLICADOS
${published.length > 0 ? published.join("\n") : "Ninguno aún"}

## SERIE DE CONTENIDO (hilo de Ariadna)
${CONTENT_SERIES.join("\n")}

## INSTRUCCIONES

Cruza los dominios para encontrar historias que ningún dominio cuenta solo. Por ejemplo:
- Si D4 (economía familiar) dice que las familias gastan 40% en cuidado, y D2 (política pública) dice que no hay subsidio → ahí hay una historia
- Si D6 (cuidador informal/género) dice que el 12% de jóvenes NEET cuidan ancianos, y D3 (mercado laboral) dice que no hay enfermeras → ahí hay otra

Propón 3-5 líneas editoriales. Para cada una:

1. **TEMA**: título descriptivo del tema editorial (específico, no genérico)
2. **GANCHO NOTICIOSO**: qué pasó recientemente (con FECHA) que hace este tema relevante AHORA
3. **DOMINIOS CRUZADOS**: qué dominios se cruzan en esta propuesta (ej: D2 × D4)
4. **GANCHO**: 1-2 líneas — la frase o pregunta que detiene al lector al hacer scroll. Debe ser concreto, no abstracto. Ej: "¿Quién jubila a la hija que cuida a sus padres?" NO "Reflexionemos sobre el cuidado informal"
5. **TONO**: 1-2 palabras que definen la actitud del post. Ej: empático, indignado, urgente, reflexivo, confrontativo
6. **AUDIENCIA**: a quién habla el post. Ej: "familias que descargan cuidado en jóvenes", "hijas cuidadoras que se reconocen en el texto", "adultos 50+ que aún no planifican su vejez"
7. **DATOS_CLAVE**: 2-3 datos concretos con fuente que el MoA debe verificar e incluir. Formato: "dato (fuente, año)". Estos son semillas — el MoA los verifica
8. **CIERRE**: cómo debe terminar el post antes del CTA. Ej: "pregunta: ¿quién lo cuidará a él cuando envejezca?", "dato que conecta con el próximo tema", "frase que resignifica el problema"
9. **MAPEO A SERIE**: número de la serie, o "fuera de serie", o "ángulo nuevo sobre serie #N ya tratada"
10. **DATOS DEL SCOUT**: 2-3 datos concretos con fecha, fuente y CONFIABILIDAD. Marca cuáles son alta confianza y cuáles necesitan verificación del MoA
11. **PRÓXIMO TEMA SUGERIDO**: qué tema podría ir después (para el teaser/cliffhanger)

Criterios ESTRICTOS:
- REGLA ABSOLUTA: toda propuesta DEBE tener un gancho noticioso con fecha específica (mes y año, 2025 o 2026). Si no hay fecha en el gancho, la propuesta ES INVÁLIDA. No la incluyas. No rellenes con propuestas débiles.
- MÁXIMO 5 propuestas, MÍNIMO 2. Es preferible entregar 2 propuestas sólidas con fecha real que 5 propuestas con ganchos inventados. Si solo hay 2 válidas, entrega 2 y explica por qué no hay más.
- SOLO usa los dominios que aparecen en los digests (D2, D3, D4, D6). NO inventes dominios que no existen.
- NO descartes temas ya publicados: si un tema ya fue tratado, propón un NUEVO ÁNGULO. Marca "ángulo nuevo sobre serie #N ya tratada". Los temas del cuidado no son infinitos: volver con otra mirada es legítimo.
- PREFIERE ángulos que visibilicen problemas invisibles
- CONSIDERA la realidad de El Salvador y América Latina
- TEMAS específicos: "el cuidador que no puede enfermarse" > "burnout del cuidador"
- TONO BienCuidar: empático pero directo, no sensacionalista
- ADVERTENCIA: los datos del scout NO están verificados. Las fechas pueden ser inexactas. El MoA (groq-news.mjs) hará la investigación real con fuentes autorizadas. El ángulo editorial que el humano escriba NO debe citar fechas específicas del scout — debe definir TONO y ENFOQUE, no datos. Los datos los aporta el MoA

## FORMATO DE SALIDA

---
### PROPUESTA N
**TEMA**: ...
**GANCHO NOTICIOSO**: ... (con fecha)
**DOMINIOS CRUZADOS**: ...
**GANCHO**: ...
**TONO**: ...
**AUDIENCIA**: ...
**DATOS_CLAVE**: ...
**CIERRE**: ...
**MAPEO A SERIE**: ...
**DATOS ESPECÍFICOS**: ...
**PRÓXIMO TEMA SUGERIDO**: ...
---

Al final:

## RECOMENDACIÓN DEL DIRECTOR
Cuál propuesta es más fuerte y por qué. Considera: impacto emocional, relevancia noticiosa, utilidad para la audiencia.

## NOTAS PARA EL EDITOR
Tendencias observadas, temas ganando tracción, ángulos a explorar en el futuro, vacíos detectados en los dominios.`;

  console.log("[Propose] Llama 3.3 70B sintetizando propuestas...");
  console.log("  Esto puede tomar 30-60s...\n");

  const data = await callGroq("llama-3.3-70b-versatile", prompt, {
    max_tokens: 2500,
    temperature: 0.6,
  });

  if (!data) {
    console.error("Error: no se pudo generar el análisis.");
    process.exit(1);
  }

  return data.choices[0]?.message?.content || "";
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════
// ── Modo --select N: extrae ángulo de propuesta N y escribe editorial-angle.txt ──
function selectProposal(n) {
  if (!existsSync(OUTPUT_FILE)) {
    console.error(`Error: no existe ${OUTPUT_FILE}. Corre primero el scout sin --select.`);
    process.exit(1);
  }

  const content = readFileSync(OUTPUT_FILE, "utf-8");

  // Extraer campos de la propuesta N
  const extractField = (field) => {
    const re = new RegExp(
      `### PROPUESTA ${n}[\\s\\S]*?\\*\\*${field}\\*\\*:\\s*(.+?)(?:\\n\\*\\*|$)`,
      "m"
    );
    const m = content.match(re);
    return m ? m[1].trim() : "";
  };

  const tema = extractField("TEMA");
  if (!tema) {
    console.error(`Error: no se encontró PROPUESTA ${n} en ${OUTPUT_FILE}.`);
    process.exit(1);
  }

  const gancho = extractField("GANCHO");
  const tono = extractField("TONO");
  const audiencia = extractField("AUDIENCIA");
  const datosClave = extractField("DATOS_CLAVE");
  const cierre = extractField("CIERRE");
  const nextTopic = extractField("PRÓXIMO TEMA SUGERIDO");

  // Escribir ángulo estructurado
  const angle = `GANCHO: ${gancho}
TONO: ${tono}
AUDIENCIA: ${audiencia}
DATOS_CLAVE: ${datosClave}
CIERRE: ${cierre}`;

  writeFileSync(ANGLE_FILE, angle, "utf-8");

  console.log(`╔═══════════════════════════════════════════════════╗`);
  console.log(`║  PROPUESTA ${n} SELECCIONADA                       ║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);
  console.log(`TEMA: ${tema}`);
  console.log(`\nÁNGULO (escrito en ${ANGLE_FILE}):`);
  console.log(`  ${angle}`);
  if (nextTopic) {
    console.log(`\nPRÓXIMO TEMA (para teaser): ${nextTopic}`);
  }
  console.log(`\n── COMANDO PARA GENERAR ARTÍCULO ──`);
  console.log(`node scripts/groq-news.mjs "${tema}" @scripts/editorial-angle.txt "${nextTopic}"`);
  console.log(`\nO pedile a Cascade: "propuesta ${n}" y lo hace por vos.`);
}

async function main() {
  const args = process.argv.slice(2);

  // Modo --select N
  if (args[0] === "--select") {
    const n = parseInt(args[1], 10);
    if (!n || n < 1) {
      console.error("Uso: node scripts/editorial-scout.mjs --select N");
      process.exit(1);
    }
    selectProposal(n);
    return;
  }

  // Modo normal: scout completo
  const t0 = Date.now();

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  EDITORIAL SCOUT — BienCuidar                     ║");
  console.log("║  4 dominios × 3 fases: SCAN → DIGEST → PROPOSE   ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  // Fase 1: Scan
  const scanResults = await scanDomains();

  // Fase 2: Digest
  const digests = await digestAll(scanResults);

  // Fase 3: Propose
  const proposals = await proposeEditorialLines(digests);

  // Guardar
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const report = `# Editorial Scout — BienCuidar
# Fecha: ${timestamp}
# Dominios: ${DOMAINS.map((d) => d.id).join(", ")}
# Fases: SCAN (Compound) → DIGEST (Llama 3.3) → PROPOSE (Llama 3.3)
#
# Para elegir una propuesta:
#   Opción A: node scripts/editorial-scout.mjs --select N
#   Opción B: decile a Cascade "propuesta N" y la aplica al MoA
#
# Luego: node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt "próximo tema"

${proposals}

---
Scout ejecutado en ${((Date.now() - t0) / 1000).toFixed(1)}s
Dominios escaneados: ${DOMAINS.length}
Artículos publicados previos: ${getPublishedArticles().length}
`;

  writeFileSync(OUTPUT_FILE, report, "utf-8");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("REPORTE EDITORIAL GENERADO");
  console.log("═══════════════════════════════════════════════════\n");
  console.log(report);
  console.log(`Tiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Reporte guardado en: ${OUTPUT_FILE}`);
  console.log("\nPRÓXIMOS PASOS:");
  console.log("  Opción A: node scripts/editorial-scout.mjs --select N");
  console.log("  Opción B: decile a Cascade \"propuesta N\" y lo hace por vos");
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
