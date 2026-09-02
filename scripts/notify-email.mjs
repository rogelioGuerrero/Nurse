/**
 * Envía el artículo generado + prompt de Gemini por email vía Resend.
 * 
 * Uso: node scripts/notify-email.mjs
 * (Lee scripts/generated-article.txt y scripts/gemini-prompt.txt)
 * 
 * Requiere: RESEND_API_KEY, RESEND_FROM, RESEND_TO en el entorno
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "content@agtisa.com";
const RESEND_TO = process.env.RESEND_TO || "info@agtisa.com";

function readOutput(filename) {
  const path = resolve(__dirname, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8").trim();
}

async function main() {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurado — saltando email");
    return;
  }

  const article = readOutput("generated-article.txt");
  const geminiPrompt = readOutput("gemini-prompt.txt");

  if (!article) {
    console.log("No hay artículo generado — saltando email");
    return;
  }

  const geminiSection = geminiPrompt
    ? `<hr style="margin:20px 0;border:none;border-top:1px solid #ddd;">
       <h3 style="color:#4285f4;">🎨 Prompt para Nano Banana</h3>
       <div style="background:#f0f4ff;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap;color:#333;">${geminiPrompt.replace(/</g, "&lt;")}</div>`
    : "";

  const html = `
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
    <h2 style="color:#333;">📝 BienCuidar — Artículo listo para publicar</h2>
    <p style="color:#666;font-size:13px;">Copia el texto del artículo y pégalo en Facebook. Copia el prompt y pégalo en Nano Banana para generar la imagen.</p>

    <h3 style="color:#0a7d28;">📄 Artículo para Facebook</h3>
    <div style="background:#f5f5f5;padding:14px;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#222;">${article.replace(/</g, "&lt;")}</div>

    ${geminiSection}

    <hr style="margin:20px 0;border:none;border-top:1px solid #ddd;">
    <p style="font-size:12px;color:#999;">Generado automáticamente por el pipeline MoA de BienCuidar.</p>
    </body></html>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: RESEND_TO,
      subject: "BienCuidar: Artículo listo para FB + prompt de imagen",
      html,
    }),
  });

  if (resp.ok) {
    const data = await resp.json();
    console.log(`✓ Email enviado a ${RESEND_TO}: ${data.id}`);
  } else {
    const text = await resp.text();
    console.error(`✗ Error enviando email (${resp.status}): ${text}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
