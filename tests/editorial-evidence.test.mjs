import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadEditorialEvidence } from "../scripts/editorial-evidence.mjs";

const root = resolve(import.meta.dirname, "..");

test("informe y ficha verificada disponibles sin conexión", () => {
  assert.ok(statSync(resolve(root, "docs/quien-cuida-BID-OCDE.pdf")).size > 100_000);
  const evidence = loadEditorialEvidence();
  assert.match(evidence, /488 mil/);
  assert.match(evidence, /26 %/);
  assert.match(evidence, /página 61 del PDF/);
  assert.ok(evidence.length < 7000, "La ficha debe caber en los prompts");
});

test("el scout y el MoA inyectan la evidencia en sus prompts", () => {
  const scout = readFileSync(resolve(root, "scripts/editorial-scout.mjs"), "utf-8");
  const moa = readFileSync(resolve(root, "scripts/groq-news.mjs"), "utf-8");
  assert.match(scout, /loadEditorialEvidence\(\)/);
  assert.match(scout, /\$\{LOCAL_EVIDENCE\}/);
  assert.match(moa, /loadEditorialEvidence\(\)/);
  assert.match(moa, /localEvidence: LOCAL_EVIDENCE/g);
  assert.match(moa, /INFORME LOCAL VERIFICADO/);
  assert.match(moa, /bundle\.fetchedUrls\.has\(u\)/);
  assert.match(moa, /familyCareTopic/);
  assert.doesNotMatch(moa, /Solo usa las que aparecen en la investigación o en el ángulo editorial/);
});
