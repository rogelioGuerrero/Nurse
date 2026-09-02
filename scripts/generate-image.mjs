/**
 * generate-image.mjs — Genera una imagen con Google Imagen 4 Fast
 *
 * Lee el prompt desde scripts/gemini-prompt.txt (o un archivo pasado por arg),
 * genera la imagen con la API de Google GenAI, y la guarda como PNG.
 *
 * Requiere: GEMINI_API_KEY en entorno
 * Uso: node scripts/generate-image.mjs [prompt-file] [output-path]
 *      node scripts/generate-image.mjs  # usa scripts/gemini-prompt.txt por default
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env automáticamente
function loadEnv() {
  try {
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PROMPT_FILE = process.argv[2] || resolve(__dirname, "gemini-prompt.txt");
const OUTPUT_PATH = process.argv[3] || resolve(__dirname, "generated-image.png");

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY no encontrada.");
  console.error("  1. Crear archivo .env con GEMINI_API_KEY=tu_key");
  console.error("  2. O setear: $env:GEMINI_API_KEY=\"tu_key\"");
  process.exit(1);
}

if (!existsSync(PROMPT_FILE)) {
  console.error(`Error: No se encontró el archivo de prompt: ${PROMPT_FILE}`);
  process.exit(1);
}

async function main() {
  const promptText = readFileSync(PROMPT_FILE, "utf-8").trim();

  console.log(`[Imagen] Generando imagen con Imagen 4 Fast...`);
  console.log(`[Imagen] Prompt: ${promptText.slice(0, 100)}...`);
  console.log(`[Imagen] Output: ${OUTPUT_PATH}`);

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const response = await ai.models.generateImages({
    model: "imagen-4.0-fast-generate-001",
    prompt: promptText,
    config: {
      numberOfImages: 1,
      outputMimeType: "image/png",
      aspectRatio: "16:9",
    },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    console.error("[Imagen] La API no devolvió imágenes.");
    process.exit(1);
  }

  const imageBytes = response.generatedImages[0].image.imageBytes;
  const buffer = Buffer.from(imageBytes, "base64");
  writeFileSync(OUTPUT_PATH, buffer);

  console.log(`[Imagen] ✅ Imagen guardada en: ${OUTPUT_PATH}`);
  console.log(`[Imagen] Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(`[Imagen] Error: ${err.message}`);
  process.exit(1);
});
