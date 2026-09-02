/**
 * add-branding.mjs — Agrega overlay de branding BienCuidar a imágenes generadas
 *
 * Uso: node scripts/add-branding.mjs "<ruta-imagen>" [--output "<ruta-salida>"]
 *
 * El overlay incluye:
 * - Gradiente oscuro semitransparente en el borde inferior
 * - "BienCuidar" en blanco, sans-serif semibold
 * - "biencuidar.agtisa.com" en blanco más pequeño debajo
 *
 * Estilo: similar a BBC, NYT, Reuters en redes sociales
 */

import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, join, basename, extname } from "path";

const args = process.argv.slice(2);
if (!args[0] || args[0] === "--help" || args[0] === "-h") {
  console.log('Uso: node scripts/add-branding.mjs "<ruta-imagen>" [--output "<ruta-salida>"]');
  console.log("");
  console.log("Si no se especifica --output, guarda junto al original con sufijo _branded");
  process.exit(0);
}

const inputPath = resolve(args[0]);
let outputPath = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) {
    outputPath = resolve(args[i + 1]);
    i++;
  }
}

if (!existsSync(inputPath)) {
  console.error(`Error: no existe el archivo ${inputPath}`);
  process.exit(1);
}

if (!outputPath) {
  const dir = dirname(inputPath);
  const name = basename(inputPath, extname(inputPath));
  outputPath = join(dir, `${name}_branded.jpg`);
}

// ── Icono SVG inline (estetoscopio de lucide-react, igual al logo de la landing page) ──
// Cuadrado con gradiente índigo + bordes redondeados + estetoscopio blanco
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

// ── Crear overlay SVG con gradiente + icono + texto ──
function createBrandingOverlay(width, height) {
  const gradientHeight = Math.round(height * 0.22);
  const gradientStart = height - gradientHeight;
  const padding = Math.round(width * 0.035);
  const brandSize = Math.round(width * 0.038);
  const urlSize = Math.round(width * 0.024);
  const urlY = height - padding;
  const brandY = urlY - urlSize + Math.round(width * 0.008);

  // Icono: escala proporcional al brandSize, alineado verticalmente con el texto
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

async function addBranding() {
  console.log(`Procesando: ${inputPath}`);

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  console.log(`Dimensiones: ${width}x${height}`);

  const overlaySvg = createBrandingOverlay(width, height);
  const overlayBuffer = Buffer.from(overlaySvg);

  const result = await sharp(inputPath)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  writeFileSync(outputPath, result);

  const inputSize = readFileSync(inputPath).length;
  const outputSize = result.length;
  console.log(`Branding agregado: ${outputPath}`);
  console.log(`Tamaño: ${(inputSize / 1024).toFixed(0)}KB → ${(outputSize / 1024).toFixed(0)}KB`);
}

addBranding().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
