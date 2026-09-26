/**
 * auto-publish.mjs — Publicación automática a Facebook (camino sin humano)
 *
 * Gate de calidad: SOLO publica si pipeline-result.json dice que el MoA
 * aprobó limpio (QA veredicto APROBADO + URLs verificadas del fetch real).
 * Si no pasó → no publica; el email con el artículo sigue llegando igual
 * (camino manual intacto).
 *
 * Flujo: pipeline-result.json → Pexels (imagen stock) → branding BienCuidar
 *        → fb-publish edge function → PATCH content_history (status: published)
 *
 * Requiere env: PEXELS_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *
 * Uso:
 *   node scripts/auto-publish.mjs                          (modo pipeline, con gate QC)
 *   node scripts/auto-publish.mjs --article <file.txt> [--query "pexels search"]
 *     (modo retro: salta el gate — la invocación manual ES la aprobación humana;
 *      inserta el registro en content_history en vez de PATCH)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULT_FILE = resolve(__dirname, "pipeline-result.json");
const ARTICLE_FILE = resolve(__dirname, "generated-article.txt");
const IMAGE_OUT = resolve(__dirname, "auto-image_branded.jpg");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://zqgtkrqfyhcvgagjhbnv.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fb-publish`;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// ── Branding overlay (misma lógica que add-branding.mjs) ──
const ICON_SVG = `
  <defs>
    <linearGradient id="iconBgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#iconBgGrad)"/>
  <g transform="translate(128, 128) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 2v2"/>
    <path d="M5 2v2"/>
    <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/>
    <path d="M8 15a6 6 0 0 0 12 0v-3"/>
    <circle cx="20" cy="10" r="2"/>
  </g>
`;

function createBrandingOverlay(width, height) {
  const gradientHeight = Math.round(height * 0.22);
  const gradientStart = height - gradientHeight;
  const padding = Math.round(width * 0.035);
  const brandSize = Math.round(width * 0.038);
  const urlSize = Math.round(width * 0.024);
  const urlY = height - padding;
  const brandY = urlY - urlSize + Math.round(width * 0.008);
  const iconSize = Math.round(brandSize * 2.4);
  const iconX = padding;
  const iconY = brandY - Math.round(iconSize * 0.75);
  const textX = padding + iconSize + Math.round(width * 0.02);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bottomGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="35%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientStart}" width="${width}" height="${gradientHeight}" fill="url(#bottomGradient)"/>
  <g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 512})">
    ${ICON_SVG}
  </g>
  <text x="${textX}" y="${brandY}" font-family="Arial, Helvetica, sans-serif" font-size="${brandSize}" font-weight="600" fill="#ffffff" letter-spacing="0.5">BienCuidar</text>
  <text x="${textX}" y="${urlY + urlSize}" font-family="Arial, Helvetica, sans-serif" font-size="${urlSize}" font-weight="400" fill="#ffffff" opacity="0.85">biencuidar.agtisa.com</text>
</svg>`;
}

// ── Pexels: buscar y descargar imagen relevante ──
async function fetchPexelsImage(query) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
    { headers: { Authorization: PEXELS_API_KEY } }
  );
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  console.log(`  Pexels: "${photo.alt || query}" (${photo.photographer})`);
  const imgRes = await fetch(photo.src.large2x || photo.src.large);
  if (!imgRes.ok) throw new Error(`Pexels download ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  return { article: get("--article"), query: get("--query") };
}

async function main() {
  const { article: articleOverride, query: queryOverride } = parseArgs();
  const retroMode = !!articleOverride;
  let article, topic, imgQuery;

  if (retroMode) {
    // Modo retro: invocación manual = aprobación humana explícita, sin gate QC
    const p = resolve(articleOverride);
    if (!existsSync(p)) {
      console.log(`No existe ${p}`);
      return;
    }
    article = readFileSync(p, "utf-8").trim();
    topic = article.split("\n")[0].slice(0, 80);
    imgQuery = `${queryOverride || "elderly care senior"} home`;
    console.log(`Modo retro (aprobación manual): "${topic}"`);
  } else {
    // 1. Gate de calidad: solo publica si el MoA aprobó limpio
    if (!existsSync(RESULT_FILE)) {
      console.log("No hay pipeline-result.json — nada que publicar.");
      return;
    }
    const result = JSON.parse(readFileSync(RESULT_FILE, "utf-8").replace(/^﻿/, ""));

    if (!result.approved) {
      console.log(`QC no pasó (veredicto: ${result.qaVeredicto || "?"}) — NO se publica. El artículo llega por email para revisión manual.`);
      return;
    }
    if ((result.urlsVerified || 0) < 1) {
      console.log("Research sin URLs verificadas — NO se publica. Email para revisión manual.");
      return;
    }

    article = existsSync(ARTICLE_FILE) ? readFileSync(ARTICLE_FILE, "utf-8").trim() : "";
    topic = result.topic;
    imgQuery = `${result.newsQueryEn || result.topic} elderly care`;
    console.log(`QC limpio (${result.urlsVerified} URLs verificadas). Auto-publicando: "${topic}"`);
  }

  if (!article) {
    console.log("No hay artículo — nada que publicar.");
    return;
  }

  // 2. Imagen: Pexels stock relacionada al tema
  if (!PEXELS_API_KEY) {
    console.log("PEXELS_API_KEY no configurada — no se puede publicar sin imagen. Email para revisión manual.");
    return;
  }
  const rawImage = await fetchPexelsImage(imgQuery);
  if (!rawImage) {
    console.log("Pexels no devolvió imagen — no se publica. Email para revisión manual.");
    return;
  }

  // 3. Branding + compresión (misma cadena que el flujo manual)
  //    El overlay se arma con las dimensiones YA redimensionadas.
  const resized = await sharp(rawImage).resize({ width: 1200, withoutEnlargement: true }).toBuffer();
  const meta = await sharp(resized).metadata();
  const overlay = Buffer.from(createBrandingOverlay(meta.width, meta.height));
  const branded = await sharp(resized)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();
  writeFileSync(IMAGE_OUT, branded);
  console.log(`  Imagen branded: ${(branded.length / 1024).toFixed(0)}KB → ${IMAGE_OUT}`);

  // 4. Publicar via fb-publish edge function
  if (!SUPABASE_ANON_KEY) {
    console.log("VITE_SUPABASE_ANON_KEY no configurada — no se publica. Email para revisión manual.");
    return;
  }
  const fbRes = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: article, imageBase64: branded.toString("base64") }),
  });
  const fbData = await fbRes.json();
  if (!fbRes.ok) {
    console.error(`Error publicando en Facebook (${fbRes.status}): ${JSON.stringify(fbData).slice(0, 300)}`);
    return; // no fail: el email ya cubre el camino manual
  }
  console.log(`✓ Publicado en Facebook. Post ID: ${fbData.postId}`);

  // 5. Registrar published en content_history.
  //    Retro: el artículo nunca tuvo INSERT → inserta fila ya publicada.
  //    Pipeline: PATCH al row generado en esta corrida (patrón fb-post.mjs).
  try {
    if (retroMode) {
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/content_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          topic,
          article_text: article,
          status: "published",
          fb_post_id: fbData.postId,
          image_path: "pexels+branding(retro)",
          published_at: new Date().toISOString(),
        }),
      });
      console.log(insRes.ok ? "✓ content_history insertado (status: published)" : `(content_history insert ${insRes.status} — no crítico)`);
    } else {
      await fetch(
        `${SUPABASE_URL}/rest/v1/content_history?topic=ilike.${encodeURIComponent(topic.slice(0, 50))}&order=id.desc&limit=1`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            status: "published",
            fb_post_id: fbData.postId,
            image_path: "pexels+branding(auto)",
            published_at: new Date().toISOString(),
          }),
        }
      );
      console.log("✓ content_history actualizado (status: published)");
    }
  } catch {
    console.log("(content_history no se actualizó — no crítico)");
  }
}

main().catch((err) => {
  console.error("Error en auto-publish:", err.message);
  // exit 0: el pipeline ya generó el artículo y el email sale igual
});
