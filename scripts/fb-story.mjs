import sharp from "sharp";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://zqgtkrqfyhcvgagjhbnv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxZ3RrcnFmeWhjdmdhZ2poYm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjE3NzAsImV4cCI6MjA5NzM5Nzc3MH0.cewfK1Go1hBJbITQ37QyeUCdzjL2z4v2MCFGDJdEJ64";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fb-story`;

const imagePath = process.argv[2];
const caption = process.argv[3] ? process.argv[3].replace(/\\n/g, "\n") : "";

if (!imagePath) {
  console.error("Uso: node scripts/fb-story.mjs <ruta-imagen> [caption]");
  console.error("El caption es opcional (las stories suelen ir sin texto o muy corto)");
  process.exit(1);
}

async function main() {
  // 1. Leer y comprimir imagen (1080px para stories)
  console.log("Comprimiendo imagen para story...");
  const raw = readFileSync(imagePath);
  const compressed = await sharp(raw)
    .resize({ width: 1080, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  console.log(
    `Imagen original: ${(raw.length / 1024).toFixed(0)}KB -> comprimida: ${(compressed.length / 1024).toFixed(0)}KB`
  );

  // 2. Convertir a base64
  const base64 = compressed.toString("base64");

  // 3. Llamar a la edge function fb-story
  console.log("Publicando story en Facebook via edge function...");
  const fbRes = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageBase64: base64,
      caption,
    }),
  });

  const fbData = await fbRes.json();

  if (!fbRes.ok) {
    console.error("Error publicando story:", JSON.stringify(fbData, null, 2));
    process.exit(1);
  }

  console.log("Story publicada exitosamente!");
  console.log("Story ID:", fbData.storyId);
  console.log("Duración: 24 horas");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
