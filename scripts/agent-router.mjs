/**
 * Agent Router — Orquestador interactivo del pipeline editorial de BienCuidar
 *
 * Flujo con human-in-the-loop en cada gate:
 * 1. DISCOVER: editorial-scout busca temas → GATE: usuario elige propuesta
 * 2. GENERATE: MoA genera artículo → GATE: usuario aprueba
 * 3. IMAGE: usuario genera imagen en Gemini → GATE: usuario pasa ruta
 * 4. PUBLISH: confirmación → se publica en Facebook
 *
 * Uso: node scripts/agent-router.mjs
 *      node scripts/agent-router.mjs --skip-scout  (usa propuestas existentes)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

const PROPOSALS_FILE = "scripts/editorial-proposals.txt";
const ANGLE_FILE = "scripts/editorial-angle.txt";
const ARTICLE_FILE = "scripts/generated-article.txt";
const GEMINI_PROMPT_FILE = "scripts/gemini-prompt.txt";

// ── ANSI colors (no deps) ──
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function banner(text) {
  const line = "═".repeat(55);
  console.log(`\n${c.cyan}╔${line}╗${c.reset}`);
  console.log(`${c.cyan}║${c.bold}${text.padEnd(55)}${c.reset}${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}╚${line}╝${c.reset}\n`);
}

function gate(msg) {
  console.log(`\n${c.yellow}▸ ${msg}${c.reset}`);
}

function ok(msg) {
  console.log(`${c.green}✓ ${msg}${c.reset}`);
}

function err(msg) {
  console.log(`${c.red}✘ ${msg}${c.reset}`);
}

function info(msg) {
  console.log(`${c.dim}${msg}${c.reset}`);
}

// ── Run a child script with real-time output ──
function runScript(scriptPath, args = []) {
  info(`Ejecutando: node ${scriptPath} ${args.join(" ")}\n`);
  const result = spawnSync("node", [scriptPath, ...args], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.status !== 0) {
    err(`Script falló con código ${result.status}`);
    return false;
  }
  return true;
}

// ── Parse proposals from editorial-proposals.txt ──
function parseProposals(content) {
  const proposals = [];
  const regex = /### PROPUESTA (\d+)[\s\S]*?(?=### PROPUESTA \d+|## RECOMENDACIÓN|$)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const num = parseInt(match[1]);
    const block = match[0];

    const extractField = (field) => {
      const re = new RegExp(`\\*\\*${field}\\*\\*:\\s*(.+?)(?:\\n\\*\\*|$)`, "m");
      const m = block.match(re);
      return m ? m[1].trim() : "";
    };

    proposals.push({
      num,
      tema: extractField("TEMA"),
      ganchoNoticioso: extractField("GANCHO NOTICIOSO"),
      dominios: extractField("DOMINIOS CRUZADOS"),
      gancho: extractField("GANCHO"),
      tono: extractField("TONO"),
      audiencia: extractField("AUDIENCIA"),
      datosClave: extractField("DATOS_CLAVE"),
      cierre: extractField("CIERRE"),
      mapeo: extractField("MAPEO A SERIE"),
      nextTopic: extractField("PRÓXIMO TEMA SUGERIDO"),
    });
  }

  // Extract director recommendation
  const recMatch = content.match(/## RECOMENDACIÓN DEL DIRECTOR\n([\s\S]*?)(?:## NOTAS|$)/);
  const notasMatch = content.match(/## NOTAS PARA EL EDITOR\n([\s\S]*?)$/);

  return {
    proposals,
    recomendacion: recMatch ? recMatch[1].trim() : "",
    notas: notasMatch ? notasMatch[1].trim() : "",
  };
}

// ── Write editorial-angle.txt from a proposal ──
function writeAngle(p) {
  const angle = `GANCHO: ${p.gancho}
TONO: ${p.tono}
AUDIENCIA: ${p.audiencia}
DATOS_CLAVE: ${p.datosClave}
CIERRE: ${p.cierre}`;
  writeFileSync(ANGLE_FILE, angle, "utf-8");
}

// ── Display a proposal in compact format ──
function displayProposal(p) {
  console.log(`  ${c.bold}${p.num}. "${p.tema}"${c.reset}`);
  if (p.ganchoNoticioso) console.log(`     ${c.dim}Noticioso: ${p.ganchoNoticioso.slice(0, 100)}${c.reset}`);
  if (p.gancho) console.log(`     ${c.magenta}Gancho: ${p.gancho.slice(0, 100)}${c.reset}`);
  if (p.tono) console.log(`     ${c.blue}Tono: ${p.tono}${c.reset}`);
  if (p.datosClave) console.log(`     ${c.dim}Datos: ${p.datosClave.slice(0, 120)}${c.reset}`);
  if (p.nextTopic) console.log(`     ${c.dim}Próximo: ${p.nextTopic.slice(0, 80)}${c.reset}`);
  console.log();
}

// ── Main ──
async function main() {
  banner("  AGENT ROUTER — Pipeline editorial BienCuidar   ");

  const rl = createInterface({ input: stdin, output: stdout });
  const skipScout = process.argv.includes("--skip-scout");

  // ═══════════════════════════════════════════════════════
  // FASE 1: DISCOVER
  // ═══════════════════════════════════════════════════════
  banner("FASE 1: Descubrir temas");

  let useExisting = false;

  if (skipScout && existsSync(PROPOSALS_FILE)) {
    useExisting = true;
    ok(`Usando propuestas existentes de ${PROPOSALS_FILE}`);
  } else if (existsSync(PROPOSALS_FILE)) {
    console.log("  1. Ejecutar editorial-scout (buscar noticias nuevas)");
    console.log("  2. Usar propuestas existentes");
    const choice = await rl.question("\n  Elegí (1/2): ");
    useExisting = choice.trim() === "2";
  }

  if (!useExisting) {
    console.log(`\n${c.dim}El scout tarda 3-4 min. Busca en 4 dominios con Compound.${c.reset}`);
    gate("Ejecutando editorial-scout...\n");
    const success = runScript("scripts/editorial-scout.mjs");
    if (!success) {
      err("El scout falló. No se pueden continuar.");
      rl.close();
      process.exit(1);
    }
  }

  // Parse proposals
  const rawContent = readFileSync(PROPOSALS_FILE, "utf-8");
  const { proposals, recomendacion, notas } = parseProposals(rawContent);

  if (proposals.length === 0) {
    err("No se encontraron propuestas en el archivo.");
    rl.close();
    process.exit(1);
  }

  console.log(`\n${c.bold}Propuestas encontradas:${c.reset}\n`);
  proposals.forEach(displayProposal);

  if (recomendacion) {
    console.log(`${c.cyan}Recomendación del director:${c.reset}`);
    console.log(`  ${c.dim}${recomendacion.slice(0, 300)}${c.reset}\n`);
  }

  // GATE 1: User selects proposal
  let selectedNum;
  while (true) {
    const answer = await rl.question(`${c.yellow}¿Cuál propuesta trabajamos? (1-${proposals.length}): ${c.reset}`);
    selectedNum = parseInt(answer.trim(), 10);
    if (selectedNum >= 1 && selectedNum <= proposals.length) break;
    err(`Elegí un número entre 1 y ${proposals.length}`);
  }

  const selected = proposals.find((p) => p.num === selectedNum) || proposals[selectedNum - 1];
  ok(`Propuesta ${selected.num} seleccionada: "${selected.tema}"`);

  // Write angle file
  writeAngle(selected);
  ok(`Ángulo editorial escrito en ${ANGLE_FILE}`);

  const tema = selected.tema;
  const nextTopic = selected.nextTopic || "";

  if (nextTopic) {
    info(`Próximo tema (para teaser): ${nextTopic}`);
  }

  // ═══════════════════════════════════════════════════════
  // FASE 2: GENERATE
  // ═══════════════════════════════════════════════════════
  banner("FASE 2: Generar artículo con MoA");

  const moaArgs = [tema, `@${ANGLE_FILE}`];
  if (nextTopic) moaArgs.push(nextTopic);

  let articleApproved = false;
  let regenerateCount = 0;

  while (!articleApproved) {
    if (regenerateCount > 0) {
      gate(`Regenerando artículo (intento ${regenerateCount + 1})...\n`);
    } else {
      gate("Ejecutando MoA (5 agentes, ~80s)...\n");
    }

    const success = runScript("scripts/groq-news.mjs", moaArgs);
    if (!success) {
      err("El MoA falló.");
      const retry = await rl.question("\n¿Reintentar? (sí/no): ");
      if (retry.trim().toLowerCase().startsWith("s")) continue;
      rl.close();
      process.exit(1);
    }

    // Display article
    const article = readFileSync(ARTICLE_FILE, "utf-8");
    console.log(`\n${c.bold}Artículo generado:${c.reset}`);
    console.log(`${c.dim}─────────────────────────────────────────────${c.reset}`);
    console.log(article);
    console.log(`${c.dim}─────────────────────────────────────────────${c.reset}`);

    // GATE 2: User approves
    const approval = await rl.question(`\n${c.yellow}¿Aprobás el artículo? (sí/no/salir): ${c.reset}`);
    const ans = approval.trim().toLowerCase();

    if (ans.startsWith("s") && !ans.startsWith("sal")) {
      articleApproved = true;
      ok("Artículo aprobado");
    } else if (ans.startsWith("sal")) {
      info("Saliendo. El artículo quedó en scripts/generated-article.txt");
      rl.close();
      process.exit(0);
    } else {
      regenerateCount++;
      if (regenerateCount >= 3) {
        err("Máximo de 3 regeneraciones. El artículo quedó en scripts/generated-article.txt");
        info("Podés editarlo manualmente y publicar con: node scripts/fb-post.mjs \"<imagen>\" @scripts/generated-article.txt");
        rl.close();
        process.exit(0);
      }
      info("Regenerando con el mismo ángulo (el MoA producirá un borrador distinto)...");
    }
  }

  // ═══════════════════════════════════════════════════════
  // FASE 3: IMAGEN
  // ═══════════════════════════════════════════════════════
  banner("FASE 3: Generar imagen");

  if (existsSync(GEMINI_PROMPT_FILE)) {
    const geminiPrompt = readFileSync(GEMINI_PROMPT_FILE, "utf-8");
    console.log(`${c.bold}Prompt para Gemini Nano Banana:${c.reset}`);
    console.log(`${c.dim}(también en ${GEMINI_PROMPT_FILE})${c.reset}\n`);
    console.log(geminiPrompt);
    console.log();
  }

  // GATE 3: User provides image path
  let imagePath = "";
  while (!imagePath) {
    const answer = await rl.question(`${c.yellow}Ruta de la imagen generada (o "salir"): ${c.reset}`);
    imagePath = answer.trim().replace(/^["']|["']$/g, ""); // strip quotes

    if (imagePath.toLowerCase() === "salir") {
      info("Saliendo. Para publicar después:");
      info(`  node scripts/fb-post.mjs "<ruta-imagen>" @scripts/generated-article.txt`);
      rl.close();
      process.exit(0);
    }

    if (!existsSync(imagePath)) {
      err(`No se encontró el archivo: ${imagePath}`);
      imagePath = "";
    }
  }

  ok(`Imagen encontrada: ${imagePath}`);

  // ═══════════════════════════════════════════════════════
  // FASE 4: PUBLISH
  // ═══════════════════════════════════════════════════════
  banner("FASE 4: Publicar en Facebook");

  const article = readFileSync(ARTICLE_FILE, "utf-8");
  const preview = article.slice(0, 120).replace(/\n/g, " ");

  console.log(`${c.bold}Resumen:${c.reset}`);
  console.log(`  ${c.dim}Post:${c.reset} "${preview}..."`);
  console.log(`  ${c.dim}Imagen:${c.reset} ${imagePath}`);
  console.log(`  ${c.dim}CTA:${c.reset} ${article.includes("biencuidar.agtisa.com") ? "✓" : "✘"}`);

  // GATE 4: Final confirmation
  const confirm = await rl.question(`\n${c.yellow}Confirmar publicación en Facebook? (sí/no): ${c.reset}`);

  if (!confirm.trim().toLowerCase().startsWith("s")) {
    info("Publicación cancelada. Para publicar después:");
    info(`  node scripts/fb-post.mjs "${imagePath}" @scripts/generated-article.txt`);
    rl.close();
    process.exit(0);
  }

  gate("Publicando...\n");
  const pubSuccess = runScript("scripts/fb-post.mjs", [imagePath, `@${ARTICLE_FILE}`]);

  if (pubSuccess) {
    ok("¡Publicación completada!");
  } else {
    err("La publicación falló. Revisá el error arriba.");
  }

  rl.close();
}

main().catch((e) => {
  console.error(`${c.red}Error fatal:${c.reset}`, e.message);
  process.exit(1);
});
