/**
 * Prueba de Groq browser_search (built-in) sobre gpt-oss-120b
 * — muestra respuesta + tool_calls
 * Para verificar trazabilidad de las herramientas usadas.
 * (groq/compound descontinuado 21-sep-2026)
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Cargar .env
function loadEnv() {
  if (process.env.GROQ_API_KEY) return;
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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const query = "Horas semanales promedio de cuidado informal en Latinoamerica y valor economico equivalente al salario minimo de El Salvador";

console.log("Consultando a gpt-oss-120b + browser_search...");
console.log("Query:", query);
console.log("\nEsto puede tardar 30-60 segundos...\n");

const res = await fetch(GROQ_API_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: query }],
    tools: [{ type: "browser_search" }],
    tool_choice: "required",
    reasoning_effort: "low",
    max_completion_tokens: 6000,
  }),
});

if (!res.ok) {
  const errText = await res.text();
  console.error(`Error ${res.status}:`, errText);
  process.exit(1);
}

const data = await res.json();
const choice = data.choices[0];

console.log("═══════════════════════════════════════════════════");
console.log("RESPUESTA:");
console.log("═══════════════════════════════════════════════════\n");
console.log(choice.message.content);

console.log("\n═══════════════════════════════════════════════════");
console.log("HERRAMIENTAS EJECUTADAS (tool_calls / executed_tools):");
console.log("═══════════════════════════════════════════════════\n");

const tools = choice.message.executed_tools || choice.message.tool_calls || [];
if (tools.length > 0) {
  tools.forEach((tool, i) => {
    console.log(`--- Tool ${i + 1}: ${tool.type || tool.function?.name} ---`);
    console.log("Arguments:", JSON.stringify(tool.arguments || tool.function?.arguments || {}).slice(0, 300));
    if (tool.output) {
      console.log("Output (primeros 500 chars):",
        typeof tool.output === "string"
          ? tool.output.slice(0, 500) + (tool.output.length > 500 ? "..." : "")
          : JSON.stringify(tool.output).slice(0, 500)
      );
    }
    console.log("");
  });
} else {
  console.log("(No se retornaron tool calls)");
}

console.log("\n═══════════════════════════════════════════════════");
console.log("USAGE:");
console.log("═══════════════════════════════════════════════════");
console.log(JSON.stringify(data.usage, null, 2));
