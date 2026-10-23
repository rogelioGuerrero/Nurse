import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = resolve(root, "docs", "quien-cuida-BID-OCDE.pdf");
const ficha = resolve(root, "docs", "quien-cuida-BID-OCDE-ficha.md");

export function loadEditorialEvidence() {
  if (!existsSync(report)) throw new Error(`Falta el informe editorial: ${report}`);
  const evidence = readFileSync(ficha, "utf-8").trim();
  if (!evidence) throw new Error(`Ficha editorial vacía: ${ficha}`);
  return evidence;
}
