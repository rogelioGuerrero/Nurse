/**
 * Genera un artículo periodístico usando Groq Compound (web search + synthesis)
 * Llama directamente a la API de Groq desde local.
 * 
 * Uso: $env:GROQ_API_KEY="gsk_..."; node scripts/groq-news.mjs [tema]
 * El resultado se guarda en scripts/generated-article.txt para revisión.
 * Después de aprobar, publicar con: node scripts/fb-post.mjs "<ruta-imagen>" @scripts/generated-article.txt
 */

import { writeFileSync } from "fs";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OUTPUT_FILE = "scripts/generated-article.txt";

const TOPIC = process.argv[2] || "burnout cuidadores adultos mayores";

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY no encontrada.");
  console.error('Setear: $env:GROQ_API_KEY="gsk_tu_key"');
  process.exit(1);
}

async function generateArticle() {
  console.log("Generando artículo con Groq Compound...");
  console.log(`Tema: ${TOPIC}`);
  console.log("Buscando fuentes en web, esto puede tomar 15-30 segundos...\n");

  const prompt = `Redacta un post de Facebook sobre: ${TOPIC}.

Reglas de formato:
- NO uses markdown (no **negritas**, no ##, no bullets con -)
- Usa 2-3 emojis profesionales (🩺 💙 🌐 🤝 ❤️‍🩹)
- Español latino/dominicano
- Tono empático y profesional
- Busca datos reales en la web si puedes

LONGITUD CRÍTICA: 150-200 palabras máximo. Sé conciso. La gente no lee textos largos en Facebook.
Estructura: 1 párrafo de gancho + 1 dato real + 1 consejo práctico + CTA.

Termina con: Publicá tu necesidad gratis en https://biencuidar.agtisa.com
Incluye 3 hashtags al final.

Devuelve SOLO el texto listo para publicar.`;

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "groq/compound",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Error de Groq API: ${res.status}`);
    console.error(err.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  let article = data.choices[0]?.message?.content || "";

  // Limpiar markdown residual
  article = article
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ");

  if (!article) {
    console.error("Error: No se generó artículo");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  // Guardar resultado
  writeFileSync(OUTPUT_FILE, article, "utf-8");

  console.log("═══════════════════════════════════════════════════");
  console.log("ARTÍCULO GENERADO");
  console.log("═══════════════════════════════════════════════════\n");
  console.log(article);
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`Guardado en: ${OUTPUT_FILE}`);
  console.log("\nPara publicar en Facebook (con imagen):");
  console.log(`  node scripts/fb-post.mjs "<ruta-imagen>" @scripts/generated-article.txt`);

  // Mostrar tools usadas por Compound
  const tools = data.choices[0]?.message?.executed_tools;
  if (tools && tools.length > 0) {
    console.log("\nHerramientas usadas por Compound:");
    tools.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.type}${t.arguments ? ": " + JSON.stringify(t.arguments).slice(0, 80) : ""}`);
    });
  }
}

generateArticle().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
