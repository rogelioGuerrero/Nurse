/**
 * add-branding-video.mjs — Ensambla video BienCuidar: Intro + Clips + CTA
 *
 * Lee intro.mp4 y cta.mp4 pre-renderizados (gen-cards.mjs).
 * Aplica branding overlay a los clips del medio.
 * Concatena todo con transiciones fade-to-black.
 *
 * Estructura final:
 *   intro.mp4 (2s, fade out → negro) → [clip1 + overlay] (fade in from black) → ... → cta.mp4 (3s)
 *
 * Los clips llevan fade in desde negro al inicio y fade out a negro al final (0.3s).
 * La intro ya viene con fade out, la CTA ya viene con fade in.
 * Visualmente: negro → intro → negro → clips → negro → CTA → negro
 *
 * Uso:
 *   node scripts/add-branding-video.mjs clip1.mp4 [clip2.mp4 ...] [--output path] [--crf 23] [--preset veryfast]
 *
 * Requiere: ffmpeg-static, sharp, y ejecutar gen-cards.mjs primero.
 */

import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { resolve, dirname, join, basename, extname } from "path";
import { execFileSync } from "child_process";
import { tmpdir } from "os";

const FFMPEG = ffmpegStatic;
const CARDS_DIR = resolve("scripts", ".cards");
const FADE_DUR = 0.4;

// ── Args ──
const args = process.argv.slice(2);
if (!args[0] || args[0] === "--help" || args[0] === "-h") {
  console.log("Uso: node scripts/add-branding-video.mjs clip1.mp4 [clip2.mp4] [--output path]");
  console.log("");
  console.log("Requiere intro.mp4 y cta.mp4 en scripts/.cards/ (gen-cards.mjs)");
  process.exit(0);
}

const inputPaths = [];
let outputPath = null;
let crf = "23";
let preset = "veryfast";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) { outputPath = resolve(args[i + 1]); i++; }
  else if (args[i] === "--crf" && args[i + 1]) { crf = args[i + 1]; i++; }
  else if (args[i] === "--preset" && args[i + 1]) { preset = args[i + 1]; i++; }
  else if (!args[i].startsWith("-")) { inputPaths.push(resolve(args[i])); }
}

if (inputPaths.length === 0) { console.error("Error: falta video de entrada"); process.exit(1); }
for (const p of inputPaths) {
  if (!existsSync(p)) { console.error(`Error: no existe ${p}`); process.exit(1); }
}

const introPath = join(CARDS_DIR, "intro.mp4");
const ctaPath = join(CARDS_DIR, "cta.mp4");

if (!existsSync(introPath) || !existsSync(ctaPath)) {
  console.error("Error: falta intro.mp4 o cta.mp4 en scripts/.cards/");
  console.error("Ejecuta primero: node scripts/gen-cards.mjs --ref <video.mp4>");
  process.exit(1);
}

if (!outputPath) {
  const dir = dirname(inputPaths[0]);
  const name = basename(inputPaths[0], extname(inputPaths[0]));
  outputPath = join(dir, `${name}_branded.mp4`);
}

// ── Probe ──
function probeVideo(videoPath) {
  try {
    execFileSync(FFMPEG, ["-i", videoPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = err.stderr || "";
    const info = { width: null, height: null, duration: null, fps: 24 };
    const durMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (durMatch) {
      info.duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
    }
    const vidMatch = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
    if (vidMatch) {
      info.width = parseInt(vidMatch[1]);
      info.height = parseInt(vidMatch[2]);
    }
    const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s+(?:fps|tbr)/);
    if (fpsMatch) {
      const v = parseFloat(fpsMatch[1]);
      if ([24, 25, 30, 60].includes(Math.round(v))) info.fps = Math.round(v);
    }
    if (info.width && info.height) return info;
  }
  return null;
}

// ── SVG para overlay ──
const STETHO = `
  <path d="M11 2v2"/><path d="M5 2v2"/>
  <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/>
  <path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>`;

async function createOverlayPng(width, height, outPath) {
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

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="35%" stop-color="#000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="icon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientStart}" width="${width}" height="${gradientHeight}" fill="url(#g)"/>
  <g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 512})">
    <rect width="512" height="512" rx="128" fill="url(#icon)"/>
    <g transform="translate(128, 128) scale(10.67)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STETHO}</g>
  </g>
  <text x="${textX}" y="${brandY}" font-family="Arial, Helvetica, sans-serif" font-size="${brandSize}" font-weight="600" fill="#ffffff" letter-spacing="0.5">BienCuidar</text>
  <text x="${textX}" y="${urlY + urlSize}" font-family="Arial, Helvetica, sans-serif" font-size="${urlSize}" font-weight="400" fill="#ffffff" opacity="0.85">biencuidar.agtisa.com</text>
</svg>`;
  writeFileSync(outPath, await sharp(Buffer.from(svg)).png().toBuffer());
}

// ── Procesar un clip: overlay + fade in/out + normalizar ──
function processClip(inputPath, outputPath, overlayPath, width, height, fps, isFirst, isLast) {
  const probe = probeVideo(inputPath);
  const dur = probe?.duration || 10;

  // Cada clip: fade in desde negro + fade out a negro
  // Esto crea fade-through-black entre todos los segmentos
  let fadeFilter = `,fade=t=in:st=0:d=${FADE_DUR}`;
  fadeFilter += `,fade=t=out:st=${(dur - FADE_DUR).toFixed(2)}:d=${FADE_DUR}`;

  const args = [
    "-y",
    "-i", inputPath,
    "-i", overlayPath,
    "-filter_complex",
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[base];` +
    `[base][1:v]overlay=0:0:format=auto,format=yuv420p,fps=${fps}${fadeFilter}[v]`,
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264", "-preset", preset, "-crf", crf,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-r", String(fps),
    "-movflags", "+faststart",
    outputPath,
  ];

  execFileSync(FFMPEG, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// ── Concat con concat demuxer (más confiable que filter) ──
function concatVideos(fileList, outputPath) {
  const listFile = join(tmpdir(), `concat_${Date.now()}.txt`);
  const list = fileList.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listFile, list);

  const args = [
    "-y", "-f", "concat", "-safe", "0",
    "-i", listFile,
    "-c:v", "libx264", "-preset", preset, "-crf", crf,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ];

  try {
    execFileSync(FFMPEG, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    if (existsSync(listFile)) unlinkSync(listFile);
  }
}

// ── Main ──
async function main() {
  const probe = probeVideo(inputPaths[0]);
  if (!probe) { console.error("Error: no se pudo leer el video"); process.exit(1); }
  const { width, height, fps } = probe;

  console.log("═══════════════════════════════════════════");
  console.log("  Ensamblaje Video BienCuidar");
  console.log("═══════════════════════════════════════════\n");
  console.log(`Target: ${width}x${height}@${fps}fps`);
  console.log(`Clips: ${inputPaths.length} | Intro: 2s | CTA: 3s\n`);

  // 1. Generar overlay PNG
  const tmpDir = join(tmpdir(), "bien-cuidar-branding");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const overlayPng = join(tmpDir, `overlay_${width}x${height}.png`);
  await createOverlayPng(width, height, overlayPng);
  console.log("✓ Overlay generado");

  // 2. Procesar clips (overlay + fade + normalizar)
  const processedClips = [];
  for (let i = 0; i < inputPaths.length; i++) {
    const out = join(tmpDir, `clip_${i}.mp4`);
    const isFirst = i === 0;
    const isLast = i === inputPaths.length - 1;
    console.log(`Procesando clip ${i + 1}/${inputPaths.length}...`);
    processClip(inputPaths[i], out, overlayPng, width, height, fps, isFirst, isLast);
    processedClips.push(out);
    console.log(`  ✓ ${basename(inputPaths[i])}`);
  }

  // 3. Concat: intro + clips + cta
  const allFiles = [introPath, ...processedClips, ctaPath];
  console.log(`\nConcatenando ${allFiles.length} segmentos...`);

  concatVideos(allFiles, outputPath);

  const outputSize = readFileSync(outputPath).length;
  console.log(`\n✓ Video final: ${outputPath}`);
  console.log(`  Tamaño: ${(outputSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Estructura: Intro 2s → ${inputPaths.length} clip(s) → CTA 3s`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.stderr) console.error(err.stderr.slice(0, 1000));
  process.exit(1);
});
