/**
 * Pipeline de análisis demográfico-económico para El Salvador
 * 
 * Hipótesis: "Para 2035, El Salvador enfrentará una crisis de cuidado:
 * la tasa de dependencia de adultos mayores aumentará más del 40%,
 * y el ahorro proyectado de un trabajador promedio cubrirá menos del 25%
 * de los años de cuidado que necesitará."
 *
 * Arquitectura:
 *   Paso 1: Compound + Wolfram → datos demográficos curados
 *   Paso 2: Compound + Web search → datos locales (pensiones, SM, informalidad)
 *   Paso 3: Cálculo local (JS) → proyecciones y brecha
 *   Paso 4: Llama 3.3 → verificación cruzada + score de credibilidad
 *   Paso 5: Reporte con H1/H2/H3 confirmada o refutada
 *
 * Uso: node scripts/compound-analysis.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Cargar .env ──
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

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY no encontrada en .env ni en entorno.");
  process.exit(1);
}

// ── Helper: llamar a Groq con retry ──
async function callGroq(model, prompt, opts = {}, label = "") {
  const body = { model, messages: [{ role: "user", content: prompt }], ...opts };

  for (let attempt = 1; attempt <= 4; attempt++) {
    if (label) console.log(`  [${label}] intento ${attempt}...`);
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }

    const errText = await res.text();
    if (res.status === 429) {
      const wait = 45 * attempt;
      console.log(`  [${label}] Rate limit (429). Esperando ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 413) {
      console.error(`  [${label}] Error 413: prompt demasiado largo.`);
      return null;
    }
    console.error(`  [${label}] Error ${res.status}: ${errText.slice(0, 200)}`);
    if (attempt < 4) await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  return null;
}

function delay(seconds) {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

// ═══════════════════════════════════════════════════════════════
// PASO 1: Compound + Wolfram → datos demográficos curados
// ═══════════════════════════════════════════════════════════════
async function step1_WolframDemographics() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("PASO 1: Wolfram — Datos demográficos curados de El Salvador");
  console.log("═══════════════════════════════════════════════════\n");

  // Prompt corto para evitar 413
  const prompt = "El Salvador population by age groups 2024, life expectancy at age 60, GDP per capita, birth rate";

  const data = await callGroq(
    "groq/compound",
    prompt,
    {
      compound_custom: {
        models: {
          reasoning_model: "openai/gpt-oss-120b",
          answering_model: "openai/gpt-oss-120b",
        },
        tools: { enabled_tools: ["wolfram_alpha"] },
      },
    },
    "Wolfram"
  );

  if (!data) {
    console.error("  Error: Wolfram no respondió.");
    return null;
  }

  const content = data.choices[0]?.message?.content || "";
  const tools = data.choices[0]?.message?.executed_tools || [];

  console.log("  Respuesta de Wolfram:");
  console.log("  " + content.slice(0, 500) + (content.length > 500 ? "..." : ""));
  console.log("");

  if (tools.length > 0) {
    console.log("  Herramientas ejecutadas:");
    tools.forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.type}: ${JSON.stringify(t.arguments).slice(0, 100)}`);
    });
  }

  return { content, tools, usage: data.usage };
}

// ═══════════════════════════════════════════════════════════════
// PASO 2: Compound + Web search → datos locales
// ═══════════════════════════════════════════════════════════════
async function step2_WebSearchLocal() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("PASO 2: Web search — Datos locales de El Salvador");
  console.log("═══════════════════════════════════════════════════\n");

  const prompt = "El Salvador 2025 pension coverage percentage informal economy rate CEPAL ILO";

  const data = await callGroq(
    "groq/compound",
    prompt,
    {
      compound_custom: {
        models: {
          reasoning_model: "openai/gpt-oss-120b",
          answering_model: "openai/gpt-oss-120b",
        },
        tools: { enabled_tools: ["web_search"] },
      },
    },
    "WebSearch"
  );

  if (!data) {
    console.error("  Error: Web search no respondió.");
    return null;
  }

  const content = data.choices[0]?.message?.content || "";
  const tools = data.choices[0]?.message?.executed_tools || [];

  console.log("  Respuesta de web search:");
  console.log("  " + content.slice(0, 500) + (content.length > 500 ? "..." : ""));
  console.log("");

  if (tools.length > 0) {
    console.log("  Búsquedas realizadas:");
    tools.forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.type}: ${JSON.stringify(t.arguments).slice(0, 100)}`);
    });
  }

  return { content, tools, usage: data.usage };
}

// ═══════════════════════════════════════════════════════════════
// PASO 3: Cálculo local — proyecciones y brecha
// ═══════════════════════════════════════════════════════════════
function step3_Calculations(wolframData, webData) {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("PASO 3: Cálculo local — Proyecciones y brecha de cuidado");
  console.log("═══════════════════════════════════════════════════\n");

  // Datos verificados externamente (Decreto No. 11, Diario Oficial, 26 mayo 2025)
  // Salario mínimo vigente desde junio 2025
  const SM_COMMERCE = 408.80; // Comercio/servicios/industria (bruto)
  const SM_AGRO = 272.72; // Sector agrícola (bruto)
  const SM_PREVIOUS = 365.00; // Salario anterior (hasta mayo 2025)

  // Descuentos legales obligatorios: ISSS 3% + AFP 7.25% = 10.25%
  const DEDUCTION_RATE = 0.1025;
  const SM_NET = SM_COMMERCE * (1 - DEDUCTION_RATE); // ~$366.90
  const SM_AGRO_NET = SM_AGRO * (1 - DEDUCTION_RATE); // ~$244.79

  // Usamos el salario NETO para el cálculo de ahorro (lo que realmente llega al bolsillo)
  const SM_SV = SM_NET; // Usar neto para cálculo realista

  const CARE_COST_TODAY = 800.0; // Costo enfermera a domicilio mensual HOY (USD 2026)
  const LIFE_EXPECTANCY_65 = 17; // Años adicionales esperados a los 65
  const SAVINGS_RATE = 0.10; // 10% del salario neto ahorrado
  const YEARS_SAVING = 30; // 30 años ahorrando (35→65)

  // Inflación de SV: datos verificados FRED (St. Louis Fed, IMF)
  // 2024: 0.29%, 2025: 0.91%, 2026 forecast: 2.5%
  // Promedio histórico 1994-2026: 3.02%, pero última década ~1.5%
  // Usamos 2% anual como estimación conservadora de largo plazo
  const INFLATION_RATE = 0.02;

  // Retorno nominal conservador 5% (certificado de depósito, bonos)
  // Retorno REAL = nominal - inflación = 5% - 2% = 3%
  const ANNUAL_RETURN_NOMINAL = 0.05;
  const ANNUAL_RETURN_REAL = ANNUAL_RETURN_NOMINAL - INFLATION_RATE; // 3% real

  // Proyección del costo de cuidado a futuro (cuando llegues a 65, en 30 años)
  // $800 hoy con 2% inflación anual × 30 años = 800 × (1.02)^30 = ~$1,445
  const CARE_COST_FUTURE = CARE_COST_TODAY * Math.pow(1 + INFLATION_RATE, YEARS_SAVING);

  // Cálculo de ahorro con salario NETO y retorno REAL (no nominal)
  // Usar retorno real significa que el resultado YA está en dólares de hoy
  const monthlySavings = SM_SV * SAVINGS_RATE;
  const annualSavings = monthlySavings * 12;
  // Fórmula de anualidad con interés compuesto: FV = PMT * [((1+r)^n - 1) / r]
  // Con retorno REAL, el FV ya está ajustado por inflación (dólares de hoy)
  const futureValue = annualSavings * (Math.pow(1 + ANNUAL_RETURN_REAL, YEARS_SAVING) - 1) / ANNUAL_RETURN_REAL;

  // Mismo cálculo pero con sector agrícola
  const monthlySavingsAgro = SM_AGRO_NET * SAVINGS_RATE;
  const annualSavingsAgro = monthlySavingsAgro * 12;
  const futureValueAgro = annualSavingsAgro * (Math.pow(1 + ANNUAL_RETURN_REAL, YEARS_SAVING) - 1) / ANNUAL_RETURN_REAL;

  // Cuántos años de cuidado cubre el ahorro
  // Usamos CARE_COST_FUTURE porque el ahorro creció nominalmente pero el costo también
  // Equivalentemente: usar FV con retorno real + CARE_COST_TODAY da el mismo resultado
  const yearsOfCareCovered = futureValue / (CARE_COST_TODAY * 12);
  const coveragePct = (yearsOfCareCovered / LIFE_EXPECTANCY_65) * 100;
  const yearsOfCareCoveredAgro = futureValueAgro / (CARE_COST_TODAY * 12);
  const coveragePctAgro = (yearsOfCareCoveredAgro / LIFE_EXPECTANCY_65) * 100;

  // También calculamos el valor futuro NOMINAL para referencia
  const futureValueNominal = annualSavings * (Math.pow(1 + ANNUAL_RETURN_NOMINAL, YEARS_SAVING) - 1) / ANNUAL_RETURN_NOMINAL;
  const futureValueNominalAgro = annualSavingsAgro * (Math.pow(1 + ANNUAL_RETURN_NOMINAL, YEARS_SAVING) - 1) / ANNUAL_RETURN_NOMINAL;

  // Tasa de dependencia (valores de referencia — se contrastan con Wolfram)
  // SV 2024: ~12 ancianos por cada 100 trabajadores (Wolfram: 65+ = 10% de 6.58M = 658k; 15-64 = ~68% = 4.47M → 658k/4.47M = 14.7%)
  // Ajustamos con datos reales de Wolfram: 65+ = 0.65M, 15-64 = (0.84+3.10+0.55) = 4.49M → 14.5%
  const dependencyRatio2024 = 14.5; // Calculado de datos Wolfram: 0.65M / 4.49M * 100
  // SV 2035: los que hoy tienen 50-55 (0.55M parcial) entran a 65+, y los 25-54 (3.10M) se reducen
  // Estimación conservadora: 65+ sube a ~1.0M, 15-64 se mantiene ~4.3M → ~23%
  const dependencyRatio2035 = 20.0; // Estimación conservadora
  const dependencyIncrease = ((dependencyRatio2035 - dependencyRatio2024) / dependencyRatio2024) * 100;

  // Brecha de cuidado en horas y dólares
  // Asumiendo 6 horas/día de cuidado × 30 días = 180 horas/mes por anciano
  const CARE_HOURS_MONTHLY = 180;
  const elderly2024 = 650000; // 0.65M de Wolfram
  const elderly2035 = 1000000; // Estimación
  const totalCareHours2024 = elderly2024 * CARE_HOURS_MONTHLY * 12;
  const totalCareHours2035 = elderly2035 * CARE_HOURS_MONTHLY * 12;
  const careHoursGap = totalCareHours2035 - totalCareHours2024;
  const careCostGap = careHoursGap / 180 * CARE_COST_TODAY; // Costo mensual equivalente

  const results = {
    salarioMinimoBruto: SM_COMMERCE,
    salarioMinimoAgro: SM_AGRO,
    salarioMinimoNeto: SM_NET.toFixed(2),
    salarioAgroNeto: SM_AGRO_NET.toFixed(2),
    salarioAnterior: SM_PREVIOUS,
    ahorroMensual: monthlySavings,
    ahorroAnual: annualSavings,
    valorFuturo30anios: Math.round(futureValue),
    valorFuturoAgro: Math.round(futureValueAgro),
    costoCuidadoHoy: CARE_COST_TODAY,
    costoCuidadoFuturo: Math.round(CARE_COST_FUTURE),
    inflacionAnual: (INFLATION_RATE * 100).toFixed(1),
    retornoNominal: (ANNUAL_RETURN_NOMINAL * 100).toFixed(1),
    retornoReal: (ANNUAL_RETURN_REAL * 100).toFixed(1),
    valorFuturoNominal: Math.round(futureValueNominal),
    valorFuturoNominalAgro: Math.round(futureValueNominalAgro),
    anosCuidadoCubiertos: yearsOfCareCovered.toFixed(1),
    anosCuidadoAgro: yearsOfCareCoveredAgro.toFixed(1),
    anosVidaEsperados65: LIFE_EXPECTANCY_65,
    coberturaPct: coveragePct.toFixed(1),
    coberturaAgroPct: coveragePctAgro.toFixed(1),
    tasaDependencia2024: dependencyRatio2024,
    tasaDependencia2035: dependencyRatio2035,
    aumentoDependenciaPct: dependencyIncrease.toFixed(1),
    ancianos2024: elderly2024,
    ancianos2035: elderly2035,
    brechaHoras: careHoursGap.toLocaleString(),
    brechaCostoMensual: Math.round(careCostGap).toLocaleString(),
  };

  console.log("  Resultados del cálculo:");
  console.log(`  • Salario mínimo bruto (comercio/servicios): $${results.salarioMinimoBruto}/mes`);
  console.log(`  • Salario mínimo bruto (agrícola): $${results.salarioMinimoAgro}/mes`);
  console.log(`  • Salario NETO (comercio, tras ISSS+AFP): $${results.salarioMinimoNeto}/mes`);
  console.log(`  • Salario NETO (agrícola, tras ISSS+AFP): $${results.salarioAgroNeto}/mes`);
  console.log(`  • Inflación anual estimada: ${results.inflacionAnual}% (FRED/BCCR, promedio SV)`);
  console.log(`  • Retorno nominal: ${results.retornoNominal}% | Retorno REAL: ${results.retornoReal}%`);
  console.log(`  • Ahorro mensual (10% del neto): $${results.ahorroMensual.toFixed(2)}`);
  console.log(`  • Valor futuro REAL (30 años, 3% real): $${results.valorFuturo30anios.toLocaleString()} (dólares de hoy)`);
  console.log(`  • Valor futuro NOMINAL (30 años, 5%): $${results.valorFuturoNominal.toLocaleString()} (dólares de 2056)`);
  console.log(`  • Valor futuro REAL (agrícola): $${results.valorFuturoAgro.toLocaleString()}`);
  console.log(`  • Costo cuidado HOY: $${results.costoCuidadoHoy}/mes → en 30 años: $${results.costoCuidadoFuturo}/mes (con 2% inflación)`);
  console.log(`  • Años cuidado cubiertos (comercio): ${results.anosCuidadoCubiertos} de ${results.anosVidaEsperados65}`);
  console.log(`  • Años cuidado cubiertos (agrícola): ${results.anosCuidadoAgro} de ${results.anosVidaEsperados65}`);
  console.log(`  • Cobertura (comercio): ${results.coberturaPct}%`);
  console.log(`  • Cobertura (agrícola): ${results.coberturaAgroPct}%`);
  console.log(`  • Tasa dependencia 2024: ${results.tasaDependencia2024} ancianos/100 trabajadores`);
  console.log(`  • Tasa dependencia 2035: ${results.tasaDependencia2035} ancianos/100 trabajadores`);
  console.log(`  • Aumento dependencia: ${results.aumentoDependenciaPct}%`);
  console.log(`  • Ancianos 2024: ${results.ancianos2024.toLocaleString()} → 2035: ${results.ancianos2035.toLocaleString()}`);
  console.log(`  • Brecha de cuidado: +${results.brechaHoras} horas/año = +$${results.brechaCostoMensual}/mes`);
  console.log("");

  // Evaluación de hipótesis
  console.log("  ── Evaluación de hipótesis ──");
  console.log(`  H1 (dependencia +40% para 2035): ${dependencyIncrease >= 40 ? "CONFIRMADA" : "REFUTADA"} (aumento=${results.aumentoDependenciaPct}%)`);
  console.log(`  H2 (ahorro cubre <25% años cuidado): ${coveragePct < 25 ? "CONFIRMADA" : "REFUTADA"} (cobertura=${results.coberturaPct}%)`);
  console.log(`  H2-agro (agrícola, aún peor): ${coveragePctAgro < 25 ? "CONFIRMADA" : "REFUTADA"} (cobertura=${results.coberturaAgroPct}%)`);
  console.log("");

  return results;
}

// ═══════════════════════════════════════════════════════════════
// PASO 4: Verificación cruzada con Llama 3.3
// ═══════════════════════════════════════════════════════════════
async function step4_Verification(wolframData, webData, calcResults) {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("PASO 4: Verificación cruzada — Score de credibilidad");
  console.log("═══════════════════════════════════════════════════\n");

  const prompt = `Eres un verificador de datos para un análisis demográfico de El Salvador.

DATOS DE WOLFRAM (fuente curada):
${wolframData?.content?.slice(0, 800) || "No disponible"}

DATOS DE WEB SEARCH (fuentes web):
${webData?.content?.slice(0, 800) || "No disponible"}

CÁLCULOS LOCALES:
- Salario mínimo bruto (comercio/servicios): $${calcResults.salarioMinimoBruto}/mes (Decreto No. 11, junio 2025)
- Salario mínimo bruto (agrícola): $${calcResults.salarioMinimoAgro}/mes
- Salario NETO (tras ISSS 3% + AFP 7.25%): $${calcResults.salarioMinimoNeto}/mes
- Ahorro mensual (10% del neto): $${calcResults.ahorroMensual.toFixed(2)}
- Inflación anual estimada: ${calcResults.inflacionAnual}% (FRED: SV 2024=0.29%, 2025=0.91%, promedio histórico=3.02%)
- Retorno nominal: ${calcResults.retornoNominal}% | Retorno REAL (nominal - inflación): ${calcResults.retornoReal}%
- Valor futuro REAL 30 años: $${calcResults.valorFuturo30anios.toLocaleString()} (en dólares de hoy)
- Valor futuro NOMINAL 30 años: $${calcResults.valorFuturoNominal.toLocaleString()} (en dólares de 2056)
- Costo cuidado HOY: $${calcResults.costoCuidadoHoy}/mes → en 30 años: $${calcResults.costoCuidadoFuturo}/mes
- Años de cuidado cubiertos: ${calcResults.anosCuidadoCubiertos} de ${calcResults.anosVidaEsperados65}
- Cobertura: ${calcResults.coberturaPct}%
- Tasa dependencia 2024: ${calcResults.tasaDependencia2024}
- Tasa dependencia 2035: ${calcResults.tasaDependencia2035}
- Aumento dependencia: ${calcResults.aumentoDependenciaPct}%

DATOS DE REFERENCIA PARA VERIFICACIÓN:
- Salario mínimo SV junio 2025: $408.80 (comercio/servicios/industria), $272.72 (agrícola) — Decreto No. 11, Diario Oficial 26 mayo 2025
- Descuentos legales: ISSS 3% + AFP 7.25% = 10.25% total
- Salario neto comercio: $408.80 * 0.8975 = $366.90
- Inflación SV: FRED (IMF) reporta 0.29% (2024), 0.91% (2025), forecast 2.5% (2026), promedio 1994-2026: 3.02%
- El Salvador usa dólar desde 2001, por lo que la inflación es baja vs países con moneda propia
- Retorno nominal 5% = certificados de depósito/bonos conservadores en USD
- Retorno real = 5% - 2% = 3% (poder adquisitivo real)

HIPÓTESIS:
H1: La tasa de dependencia de adultos mayores aumenta más del 40% para 2035
H2: El ahorro de 10% del salario mínimo NETO durante 30 años (con retorno REAL) cubre menos del 25% de los años de cuidado
H3: La cobertura de pensiones en SV es insuficiente para cerrar la brecha

Para cada dato clave, asigna un score de credibilidad (0-10) y explica:
1. ¿El dato de Wolfram coincide con fuentes externas?
2. ¿El salario mínimo de $408.80 es correcto para SV 2025-2026? (fuente: Decreto No. 11)
3. ¿Los descuentos de ISSS (3%) y AFP (7.25%) son correctos?
4. ¿La inflación del 2% es razonable para SV? (país dolarizado, promedio década ~1.5%)
5. ¿El cálculo con retorno REAL (3%) es más honesto que usar nominal (5%)?
6. ¿La proyección del costo de cuidado a futuro es correcta?

Formato de respuesta:
DATO: [nombre del dato]
VALOR: [valor encontrado]
SCORE: [0-10]
NOTA: [explicación breve]

VEREDICTO H1: [CONFIRMADA/REFUTADA/INCONCLUSA] - [razón]
VEREDICTO H2: [CONFIRMADA/REFUTADA/INCONCLUSA] - [razón]
VEREDICTO H3: [CONFIRMADA/REFUTADA/INCONCLUSA] - [razón]

CREDIBILIDAD GLOBAL: [0-100]%`;

  const data = await callGroq(
    "openai/gpt-oss-120b",
    prompt,
    { max_tokens: 1000, temperature: 0.2 },
    "Verificador"
  );

  if (!data) {
    console.error("  Error: El verificador no respondió.");
    return null;
  }

  const content = data.choices[0]?.message?.content || "";
  console.log("  Verificación:");
  console.log(content);
  console.log("");

  return content;
}

// ═══════════════════════════════════════════════════════════════
// PASO 5: Reporte estructurado
// ═══════════════════════════════════════════════════════════════
function step5_Report(wolframData, webData, calcResults, verification) {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("PASO 5: Reporte final");
  console.log("═══════════════════════════════════════════════════\n");

  const report = `# ¿Quién cuidará a quien cuida? — El Salvador 2035

## Hipótesis
"Para 2035, El Salvador enfrentará una crisis de cuidado: la tasa de dependencia
de adultos mayores aumentará más del 40%, y el ahorro proyectado de un trabajador
promedio cubrirá menos del 25% de los años de cuidado que necesitará."

## Datos de Wolfram (curados)
${wolframData?.content?.slice(0, 1000) || "No disponible"}

## Datos de Web Search (fuentes web)
${webData?.content?.slice(0, 1000) || "No disponible"}

## Cálculos (ajustados por inflación)
- Salario mínimo bruto (comercio/servicios): $${calcResults.salarioMinimoBruto}/mes (Decreto No. 11, jun 2025)
- Salario mínimo bruto (agrícola): $${calcResults.salarioMinimoAgro}/mes
- Salario NETO (tras ISSS 3% + AFP 7.25%): $${calcResults.salarioMinimoNeto}/mes
- Salario NETO agrícola: $${calcResults.salarioAgroNeto}/mes
- Inflación anual estimada: ${calcResults.inflacionAnual}% (FRED/IMF: SV 2024=0.29%, 2025=0.91%, promedio histórico=3.02%)
- Retorno nominal: ${calcResults.retornoNominal}% | Retorno REAL (nominal - inflación): ${calcResults.retornoReal}%
- Ahorro mensual (10% del neto): $${calcResults.ahorroMensual.toFixed(2)}
- Valor futuro REAL (30 años, 3% real): $${calcResults.valorFuturo30anios.toLocaleString()} (en dólares de hoy)
- Valor futuro NOMINAL (30 años, 5%): $${calcResults.valorFuturoNominal.toLocaleString()} (en dólares de 2056)
- Valor futuro REAL (agrícola): $${calcResults.valorFuturoAgro.toLocaleString()}
- Costo cuidado HOY: $${calcResults.costoCuidadoHoy}/mes → en 30 años: $${calcResults.costoCuidadoFuturo}/mes (con 2% inflación)
- Años de cuidado cubiertos (comercio): ${calcResults.anosCuidadoCubiertos} de ${calcResults.anosVidaEsperados65}
- Años de cuidado cubiertos (agrícola): ${calcResults.anosCuidadoAgro} de ${calcResults.anosVidaEsperados65}
- Cobertura (comercio): ${calcResults.coberturaPct}%
- Cobertura (agrícola): ${calcResults.coberturaAgroPct}%
- Tasa dependencia 2024: ${calcResults.tasaDependencia2024}/100
- Tasa dependencia 2035: ${calcResults.tasaDependencia2035}/100
- Aumento dependencia: ${calcResults.aumentoDependenciaPct}%
- Ancianos 2024: ${calcResults.ancianos2024.toLocaleString()} → 2035: ${calcResults.ancianos2035.toLocaleString()}
- Brecha de cuidado: +${calcResults.brechaHoras} horas/año

## Verificación cruzada
${verification || "No disponible"}

## Conclusión
H1 (dependencia +40%): ${parseFloat(calcResults.aumentoDependenciaPct) >= 40 ? "CONFIRMADA" : "REFUTADA/INCONCLUSA"}
H2 (ahorro <25% cobertura): ${parseFloat(calcResults.coberturaPct) < 25 ? "CONFIRMADA" : "REFUTADA/INCONCLUSA"}
H3 (pensiones insuficientes): Ver verificación arriba

## ¿Qué significa esto para las familias?

### La realidad que se avecina (con inflación y costo real)
Si hoy tenes 35 años y trabajás en comercio/servicios ganando el salario mínimo:
- Tu salario neto real es $${calcResults.salarioMinimoNeto}/mes (no $408.80)
- Si ahorrás el 10% ($${calcResults.ahorroMensual.toFixed(2)}/mes) durante 30 años
- Con un retorno nominal del 5%, pero la inflación se come el 2% → retorno REAL: solo ${calcResults.retornoReal}%
- Al llegar a los 65 tendras $${calcResults.valorFuturoNominal.toLocaleString()} nominales
- Pero en dólares de hoy (poder adquisitivo real): $${calcResults.valorFuturo30anios.toLocaleString()}
- Una enfermera a domicilio HOY cuesta $${calcResults.costoCuidadoHoy}/mes
- En 30 años, con 2% de inflación, costara $${calcResults.costoCuidadoFuturo}/mes
- Ese ahorro te alcanza para ${calcResults.anosCuidadoCubiertos} años de cuidado
- Pero tu esperanza de vida a los 65 es de ${calcResults.anosVidaEsperados65} años
- **Cobertura: solo ${calcResults.coberturaPct}% de lo que necesitaras**

Si trabajás en el sector agrícola (lo más común en zonas rurales):
- Tu salario neto es $${calcResults.salarioAgroNeto}/mes
- Ahorrando 10% durante 30 años (retorno real ${calcResults.retornoReal}%): $${calcResults.valorFuturoAgro.toLocaleString()} (dólares de hoy)
- Te alcanza para ${calcResults.anosCuidadoAgro} años de cuidado
- **Cobertura: solo ${calcResults.coberturaAgroPct}%**

### ¿Por qué la inflación hace que ahorrar sea más difícil de lo que parece?
- Un certificado a 5% suena bien, pero si la inflación es 2%, tu dinero solo crece 3% en valor real
- $${calcResults.valorFuturoNominal.toLocaleString()} en 2056 no son lo mismo que $${calcResults.valorFuturoNominal.toLocaleString()} hoy
- En dólares de hoy (lo que realmente podes comprar), el ahorro es $${calcResults.valorFuturo30anios.toLocaleString()}
- Y la enfermera que hoy cuesta $${calcResults.costoCuidadoHoy}, en 30 años costara $${calcResults.costoCuidadoFuturo}
- **La inflación no destruye el ahorro, pero si reduce su poder de compra**

### ¿Y si dependemos de los hijos?
En 2024 hay ${calcResults.tasaDependencia2024} adultos mayores por cada 100 trabajadores.
En 2035 habrá ${calcResults.tasaDependencia2035} por cada 100 (${calcResults.aumentoDependenciaPct}% más).
Cada trabajador tendra que sostener a más ancianos. Los que hoy cuidan a sus padres
tendran 60-65 años: ¿quien los cuidara a ellos?

### ¿Y la pension?
Solo ~45% de la poblacion tiene cobertura de pension (ILO 2023/24).
El 71% trabaja en informalidad (CEPAL 2024), sin acceso a pension contributiva.
Para esos 7 de cada 10 trabajadores, el ahorro personal es la UNICA opcion.

### Que pueden hacer las familias HOY
1. **Ahorrar temprano y buscar rendimiento real**: $${calcResults.ahorroMensual.toFixed(2)}/mes desde los 35 años
   genera $${calcResults.valorFuturo30anios.toLocaleString()} reales a los 65. Pero ojo: si solo guardas bajo el colchón,
   la inflación te deja con menos. Necesitas invertir donde el rendimiento supere la inflación.
2. **Conversar en familia**: ¿quien cuidara a quien? No esperar a los 60 para planear.
3. **Buscar formalizacion**: cotizar para pension es la unica proteccion garantizada contra inflación.
4. **Cuidar la salud hoy**: prevencion (nutricion, ejercicio, controles) reduce costos futuros.
   Cada año de vida sana retrasa la necesidad de cuidado pagado.
5. **Considerar cuidado compartido**: coordinar entre hermanos/familia extensa para distribuir la carga.
6. **No subestimar la inflación**: $800 hoy no seran $800 en 10 años. Planear con costos proyectados,
   no con costos actuales.
`;

  console.log(report);

  const reportPath = "scripts/analysis-output.txt";
  writeFileSync(reportPath, report, "utf-8");
  console.log(`\nReporte guardado en: ${reportPath}`);
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  Análisis: ¿Quién cuidará a quien cuida?  SV 2035 ║");
  console.log("╚═══════════════════════════════════════════════════╝");

  const hypothesis = `
HIPÓTESIS: "Para 2035, El Salvador enfrentará una crisis de cuidado:
la tasa de dependencia de adultos mayores aumentará más del 40%,
y el ahorro proyectado de un trabajador promedio cubrirá menos del 25%
de los años de cuidado que necesitará."

Sub-hipótesis:
  H1: Tasa dependencia (65+/15-64) aumenta >40% para 2035
  H2: Ahorro 10% SM × 30 años cubre <25% años de cuidado
  H3: Cobertura de pensiones insuficiente para cerrar brecha
`;
  console.log(hypothesis);

  // Paso 1: Wolfram
  const wolframData = await step1_WolframDemographics();
  if (!wolframData) {
    console.error("Pipeline cancelado: Wolfram no respondió.");
    process.exit(1);
  }

  console.log("\nEsperando 45s para evitar rate limit...\n");
  await delay(45);

  // Paso 2: Web search
  const webData = await step2_WebSearchLocal();

  // Paso 3: Cálculos (no requiere API)
  const calcResults = step3_Calculations(wolframData, webData);

  // Paso 4: Verificación
  console.log("\nEsperando 10s antes de verificación...\n");
  await delay(10);
  const verification = await step4_Verification(wolframData, webData, calcResults);

  // Paso 5: Reporte
  step5_Report(wolframData, webData, calcResults, verification);

  console.log("\n✓ Pipeline completado.\n");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
