import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

async function main() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fb-post-metrics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();

  if (data.error) {
    console.log("Error:", data.error);
    return;
  }

  console.log("=== RESUMEN ===");
  console.log(`Posts: ${data.summary.total_posts}`);
  console.log(`Reacciones: ${data.summary.total_reactions}`);
  console.log(`Comentarios: ${data.summary.total_comments}`);
  console.log(`Shares: ${data.summary.total_shares}`);
  console.log(`Engagement total: ${data.summary.total_engagement}`);

  console.log("\n=== TODOS LOS POSTS (ordenados por engagement) ===\n");
  data.posts.forEach((p, i) => {
    const preview = (p.message || "(sin texto)")
      .slice(0, 100)
      .replace(/\n/g, " ");
    console.log(
      `${i + 1}. [${p.reactions}R ${p.comments}C ${p.shares}S = ${p.engagement}E] ${preview}`
    );
    console.log(`   Fecha: ${p.created_time}`);
    if (p.permalink_url) console.log(`   URL: ${p.permalink_url}`);
    if (p.error) console.log(`   Error: ${p.error}`);
    console.log();
  });
}

main().catch((err) => console.log("Error:", err.message));
