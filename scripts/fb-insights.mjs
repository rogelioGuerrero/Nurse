/**
 * Lee métricas de Facebook via edge function fb-insights
 * y genera un resumen que el editorial-scout puede usar para
 * saber qué contenido funciona mejor.
 *
 * Uso: node scripts/fb-insights.mjs
 * Salida: console + scripts/fb-insights-summary.txt
 */

import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Cargar .env
function loadEnv() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
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

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://zqgtkrqfyhcvgagjhbnv.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const OUTPUT_FILE = "scripts/fb-insights-summary.txt";

async function main() {
  if (!SUPABASE_ANON_KEY) {
    console.error("Falta VITE_SUPABASE_ANON_KEY en .env");
    process.exit(1);
  }

  console.log("Obteniendo insights de Facebook...\n");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/fb-insights`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error ${res.status}:`, text);
    process.exit(1);
  }

  const data = await res.json();

  if (!data.posts || data.posts.length === 0) {
    console.log("No se encontraron posts.");
    return;
  }

  const posts = data.posts;

  // Resumen general
  const totalImpressions = posts.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalReactions = posts.reduce((s, p) => s + (p.reactions || 0), 0);
  const totalEngagement = posts.reduce((s, p) => s + (p.engagement || 0), 0);

  console.log(`Posts analizados: ${posts.length}`);
  console.log(`Impresiones totales: ${totalImpressions}`);
  console.log(`Reacciones totales: ${totalReactions}`);
  console.log(`Engagement total: ${totalEngagement}`);

  // Top posts por engagement
  const sorted = [...posts].sort(
    (a, b) => (b.engagement || 0) - (a.engagement || 0)
  );

  console.log("\nTop 5 posts por engagement:");
  sorted.slice(0, 5).forEach((p, i) => {
    const preview = (p.message || "(sin texto)").slice(0, 60).replace(/\n/g, " ");
    console.log(
      `  ${i + 1}. [${p.reactions || 0} reacciones, ${p.impressions || 0} impresiones] ${preview}...`
    );
  });

  // Detectar si las métricas están en 0 (falta permiso read_insights)
  const allZero = totalImpressions === 0 && totalReactions === 0;
  if (allZero) {
    console.log(
      "\n⚠️  Todas las métricas están en 0. Probablemente falta el permiso"
    );
    console.log("   'read_insights' en el token de Facebook Graph API.");
    console.log("   Verificar en developers.facebook.com > App Review.");
  }

  // Generar resumen para el scout
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  let report = `# FB Insights Summary — BienCuidar
# Fecha: ${timestamp}
# Posts analizados: ${posts.length}
# Impresiones totales: ${totalImpressions}
# Reacciones totales: ${totalReactions}
# Engagement total: ${totalEngagement}
`;

  if (allZero) {
    report += "# ⚠️ Métricas en 0 — falta permiso read_insights en FB token\n";
  }

  report += "\n# Top posts por engagement:\n";
  sorted.slice(0, 10).forEach((p, i) => {
    const preview = (p.message || "(sin texto)")
      .slice(0, 80)
      .replace(/\n/g, " ");
    report += `# ${i + 1}. [${p.reactions || 0} ❤️, ${p.impressions || 0} 👁️] ${preview}\n`;
    report += `#    ${p.created_time} — ${p.permalink_url}\n`;
  });

  // Guardar
  writeFileSync(OUTPUT_FILE, report, "utf-8");
  console.log(`\nResumen guardado en: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
