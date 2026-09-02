/**
 * generate-image.mjs — Genera una imagen con Pollinations.ai (FLUX)
 *
 * Lee el prompt desde scripts/gemini-prompt.txt (o un archivo pasado por arg),
 * genera la imagen con la API gratuita de Pollinations, y la guarda como PNG.
 *
 * Sin API key, sin registro, sin costo.
 * Rate limit anónimo: 1 request cada 15s.
 *
 * Uso: node scripts/generate-image.mjs [prompt-file] [output-path]
 *      node scripts/generate-image.mjs  # usa scripts/gemini-prompt.txt por default
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env automáticamente (para POLLINATIONS_API_KEY opcional)
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

const PROMPT_FILE = process.argv[2] || resolve(__dirname, "gemini-prompt.txt");
const OUTPUT_PATH = process.argv[3] || resolve(__dirname, "generated-image.png");
const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || "";

if (!existsSync(PROMPT_FILE)) {
  console.error(`Error: No se encontró el archivo de prompt: ${PROMPT_FILE}`);
  process.exit(1);
}

async function main() {
  const promptText = readFileSync(PROMPT_FILE, "utf-8").trim();

  console.log(`[Imagen] Generando imagen con Pollinations FLUX...`);
  console.log(`[Imagen] Prompt: ${promptText.slice(0, 100)}...`);
  console.log(`[Imagen] Output: ${OUTPUT_PATH}`);

  const params = new URLSearchParams({
    model: "flux",
    width: "1280",
    height: "720",
    nologo: "true",
    enhance: "true",
  });

  if (POLLINATIONS_KEY) {
    params.set("token", POLLINATIONS_KEY);
  }

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?${params}`;

  console.log(`[Imagen] Descargando desde Pollinations...`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[Imagen] Error HTTP ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(OUTPUT_PATH, buffer);

  console.log(`[Imagen] ✅ Imagen guardada en: ${OUTPUT_PATH}`);
  console.log(`[Imagen] Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(`[Imagen] Error: ${err.message}`);
  process.exit(1);
});
