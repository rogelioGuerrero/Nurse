import sharp from "sharp";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://zqgtkrqfyhcvgagjhbnv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxZ3RrcnFmeWhjdmdhZ2poYm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjE3NzAsImV4cCI6MjA5NzM5Nzc3MH0.cewfK1Go1hBJbITQ37QyeUCdzjL2z4v2MCFGDJdEJ64";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fb-publish`;

const imagePath = process.argv[2];
const messageArg = process.argv[3];

if (!imagePath || !messageArg) {
  console.error("Uso: node scripts/fb-post.mjs <ruta-imagen> <mensaje|@archivo>");
  console.error("  Ejemplo con texto:  node scripts/fb-post.mjs foto.png \"Hola mundo\"");
  console.error("  Ejemplo con archivo: node scripts/fb-post.mjs foto.png @scripts/generated-article.txt");
  process.exit(1);
}

// If message starts with @, read from file (avoids PowerShell encoding issues)
const message = messageArg.startsWith("@")
  ? readFileSync(messageArg.slice(1), "utf-8").replace(/\\n/g, "\n")
  : messageArg.replace(/\\n/g, "\n");

async function main() {
  // 1. Leer y comprimir imagen
  console.log("Comprimiendo imagen...");
  const raw = readFileSync(imagePath);
  const compressed = await sharp(raw)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  console.log(
    `Imagen original: ${(raw.length / 1024).toFixed(0)}KB -> comprimida: ${(compressed.length / 1024).toFixed(0)}KB`
  );

  // 2. Convertir a base64
  const base64 = compressed.toString("base64");

  // 3. Llamar a la edge function fb-publish con imageBase64
  console.log("Publicando en Facebook via edge function...");
  const fbRes = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: message,
      imageBase64: base64,
    }),
  });

  const fbData = await fbRes.json();

  if (!fbRes.ok) {
    console.error("Error publicando en Facebook:", JSON.stringify(fbData, null, 2));
    process.exit(1);
  }

  console.log("Publicado exitosamente!");
  console.log("Post ID:", fbData.postId);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
