/**
 * Prueba de Groq Compound — muestra respuesta + executed_tools
 * Para verificar trazabilidad de las herramientas usadas.
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

console.log("Consultando a Groq Compound...");
console.log("Query:", query);
console.log("\nEsto puede tardar 30-60 segundos...\n");

const res = await fetch(GROQ_API_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "groq/compound",
    messages: [{ role: "user", content: query }],
    compound_custom: {
      models: {
        reasoning_model: "openai/gpt-oss-120b",
        answering_model: "openai/gpt-oss-120b",
      },
      tools: { enabled_tools: ["web_search", "code_interpreter", "wolfram_alpha"] },
    },
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
console.log("RESPUESTA DE COMPOUND:");
console.log("═══════════════════════════════════════════════════\n");
console.log(choice.message.content);

console.log("\n═══════════════════════════════════════════════════");
console.log("HERRAMIENTAS EJECUTADAS (executed_tools):");
console.log("═══════════════════════════════════════════════════\n");

if (choice.message.executed_tools) {
  choice.message.executed_tools.forEach((tool, i) => {
    console.log(`--- Tool ${i + 1}: ${tool.type} ---`);
    console.log("Arguments:", tool.arguments);
    console.log("Output (primeros 500 chars):", 
      typeof tool.output === "string" 
        ? tool.output.slice(0, 500) + (tool.output.length > 500 ? "..." : "")
        : JSON.stringify(tool.output).slice(0, 500)
    );
    console.log("");
  });
} else {
  console.log("(No se retornaron executed_tools)");
}

console.log("\n═══════════════════════════════════════════════════");
console.log("USAGE:");
console.log("═══════════════════════════════════════════════════");
console.log(JSON.stringify(data.usage, null, 2));
