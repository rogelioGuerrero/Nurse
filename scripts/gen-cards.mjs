/**
 * gen-cards.mjs — Genera cards de video BienCuidar (intro + CTA)
 *
 * Produce 2 archivos MP4 standalone, pre-renderizados:
 *   scripts/.cards/intro.mp4  — 2s, reutilizable para todos los videos
 *   scripts/.cards/cta.mp4    — 3s, cambia según el artículo
 *
 * Cada card tiene fade in desde negro y fade out a negro integrados.
 * Resolución y FPS se detectan del primer video pasado como referencia,
 * o se especifican con --width, --height, --fps.
 *
 * Uso:
 *   node scripts/gen-cards.mjs [--ref video.mp4] [--cta "texto"] [--width 1280 --height 720 --fps 24]
 *
 * Si no se pasa --ref, usa 1280x720@24fps por defecto.
 * Si no se pasa --cta, lee de scripts/generated-article.txt.
 */

import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { execFileSync } from "child_process";
import { tmpdir } from "os";

const FFMPEG = ffmpegStatic;
const CARDS_DIR = resolve("scripts", ".cards");

// ── Args ──
const args = process.argv.slice(2);
let refVideo = null;
let ctaText = null;
let width = 1280;
let height = 720;
let fps = 24;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ref" && args[i + 1]) { refVideo = resolve(args[i + 1]); i++; }
  else if (args[i] === "--cta" && args[i + 1]) { ctaText = args[i + 1]; i++; }
  else if (args[i] === "--width" && args[i + 1]) { width = parseInt(args[i + 1]); i++; }
  else if (args[i] === "--height" && args[i + 1]) { height = parseInt(args[i + 1]); i++; }
  else if (args[i] === "--fps" && args[i + 1]) { fps = parseInt(args[i + 1]); i++; }
}

// ── Probe video referencia ──
function probeVideo(videoPath) {
  try {
    execFileSync(FFMPEG, ["-i", videoPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = err.stderr || "";
    const vidMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
    const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s+(?:fps|tbr)/);
    if (vidMatch) {
      width = parseInt(vidMatch[1], 10);
      height = parseInt(vidMatch[2], 10);
    }
    if (fpsMatch) {
      const v = parseFloat(fpsMatch[1]);
      if (v === 24 || v === 25 || v === 30 || v === 60) fps = Math.round(v);
    }
  }
}

if (refVideo && existsSync(refVideo)) {
  probeVideo(refVideo);
  console.log(`Referencia: ${width}x${height}@${fps}fps`);
} else {
  console.log(`Default: ${width}x${height}@${fps}fps`);
}

// ── Extraer CTA ──
function extractCTA() {
  if (ctaText) return ctaText;
  try {
    const article = readFileSync("scripts/generated-article.txt", "utf-8");
    for (const line of article.split("\n")) {
      if (line.includes("biencuidar.agtisa.com") && line.length > 20) {
        let clean = line.replace(/#[^\s]+/g, "").replace(/🩺💙\s*/g, "").trim();
        if (clean.length > 100) {
          const cut = clean.search(/[.,]\s/);
          if (cut > 20) clean = clean.slice(0, cut + 1);
        }
        return clean;
      }
    }
  } catch {}
  return "Cuidado profesional en casa";
}

// ── SVG helpers ──
const STETHO = `
  <path d="M11 2v2"/><path d="M5 2v2"/>
  <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/>
  <path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>`;

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

// ── Generar PNGs ──
async function makeIntroPng(w, h, outPath) {
  const iconSize = Math.round(w * 0.15);
  const brandSize = Math.round(w * 0.07);
  const tagSize = Math.round(w * 0.032);
  const cy = Math.round(h * 0.42);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f0a2e"/><stop offset="50%" stop-color="#312e81"/><stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="icon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.15"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${(w - iconSize) / 2}, ${cy - iconSize}) scale(${iconSize / 512})">
    <rect width="512" height="512" rx="128" fill="url(#icon)"/>
    <g transform="translate(128, 128) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STETHO}</g>
  </g>
  <text x="${w / 2}" y="${cy + brandSize * 0.8}" font-family="Arial, Helvetica, sans-serif" font-size="${brandSize}" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">BienCuidar</text>
  <text x="${w / 2}" y="${cy + brandSize * 0.8 + tagSize * 1.8}" font-family="Arial, Helvetica, sans-serif" font-size="${tagSize}" font-weight="400" fill="#a5b4fc" text-anchor="middle" letter-spacing="3">Cuidado profesional en casa</text>
</svg>`;
  writeFileSync(outPath, await sharp(Buffer.from(svg)).png().toBuffer());
}

async function makeCTAPng(w, h, ctaText, outPath) {
  const iconSize = Math.round(w * 0.1);
  const brandSize = Math.round(w * 0.05);
  const ctaSize = Math.round(w * 0.036);
  const urlSize = Math.round(w * 0.026);
  const lines = wrapText(ctaText, 30).slice(0, 4);
  const lh = Math.round(ctaSize * 1.4);
  const totalH = lines.length * lh;
  const cy = Math.round(h * 0.42);
  const iconY = cy - Math.round(h * 0.14);
  const brandY = iconY + iconSize + Math.round(w * 0.02);
  const ctaY = brandY + Math.round(w * 0.05);
  const urlY = ctaY + totalH + Math.round(w * 0.035);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f0a2e"/><stop offset="50%" stop-color="#312e81"/><stop offset="100%" stop-color="#0f0a2e"/>
    </linearGradient>
    <linearGradient id="icon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.12"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${(w - iconSize) / 2}, ${iconY}) scale(${iconSize / 512})">
    <rect width="512" height="512" rx="128" fill="url(#icon)"/>
    <g transform="translate(128, 128) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STETHO}</g>
  </g>
  <text x="${w / 2}" y="${brandY}" font-family="Arial, Helvetica, sans-serif" font-size="${brandSize}" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">BienCuidar</text>
  ${lines.map((l, i) => `<text x="${w / 2}" y="${ctaY + i * lh}" font-family="Arial, Helvetica, sans-serif" font-size="${ctaSize}" font-weight="500" fill="#e0e7ff" text-anchor="middle">${escapeXml(l)}</text>`).join("\n  ")}
  <text x="${w / 2}" y="${urlY}" font-family="Arial, Helvetica, sans-serif" font-size="${urlSize}" font-weight="600" fill="#a5b4fc" text-anchor="middle" letter-spacing="1">biencuidar.agtisa.com</text>
</svg>`;
  writeFileSync(outPath, await sharp(Buffer.from(svg)).png().toBuffer());
}

// ── Renderizar PNG → MP4 con fade in/out ──
// Ken Burns solo para intro (sin texto largo). CTA sin zoom para legibilidad.
function renderCardPngToMp4(pngPath, mp4Path, duration, fadeDur, useKenBurns = false) {
  const totalFrames = Math.round(duration * fps);

  let vf;
  if (useKenBurns) {
    const zoomExpr = "1+0.03*on/" + totalFrames;
    vf =
      `scale=${width * 2}:${height * 2}:flags=lanczos,` +
      `zoompan=z='${zoomExpr}':d=${totalFrames}:x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':s=${width}x${height}:fps=${fps},` +
      `format=yuv420p,` +
      `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${(duration - fadeDur).toFixed(2)}:d=${fadeDur}`;
  } else {
    vf =
      `scale=${width}:${height},format=yuv420p,fps=${fps},` +
      `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${(duration - fadeDur).toFixed(2)}:d=${fadeDur}`;
  }

  const args = [
    "-y",
    "-loop", "1", "-i", pngPath,
    "-t", String(duration),
    "-vf", vf,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-f", "mp4",
    mp4Path,
  ];

  execFileSync(FFMPEG, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// ── Main ──
async function main() {
  if (!existsSync(CARDS_DIR)) mkdirSync(CARDS_DIR, { recursive: true });

  const tmpDir = join(tmpdir(), "bien-cuidar-cards");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const cta = extractCTA();
  console.log(`CTA: "${cta}"\n`);

  // 1. Generar PNGs
  const introPng = join(tmpDir, `intro_${width}x${height}.png`);
  const ctaPng = join(tmpDir, `cta_${width}x${height}.png`);

  console.log("Generando PNGs...");
  await makeIntroPng(width, height, introPng);
  await makeCTAPng(width, height, cta, ctaPng);
  console.log("  ✓ Intro PNG");
  console.log("  ✓ CTA PNG\n");

  // 2. Renderizar a MP4
  const introMp4 = join(CARDS_DIR, "intro.mp4");
  const ctaMp4 = join(CARDS_DIR, "cta.mp4");

  console.log(`Renderizando intro.mp4 (${width}x${height}@${fps}, 2s, fade 0.4s, Ken Burns)...`);
  renderCardPngToMp4(introPng, introMp4, 2, 0.4, true);
  console.log("  ✓");

  console.log(`Renderizando cta.mp4 (${width}x${height}@${fps}, 5s, fade 0.5s)...`);
  renderCardPngToMp4(ctaPng, ctaMp4, 5, 0.5, false);
  console.log("  ✓\n");

  console.log(`Cards generados en: ${CARDS_DIR}`);
  console.log(`  intro.mp4 — 2s (reutilizable)`);
  console.log(`  cta.mp4   — 5s (artículo actual)`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.stderr) console.error(err.stderr.slice(0, 800));
  process.exit(1);
});
