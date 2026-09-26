/**
 * news-fetch.mjs — Retrieval layer sin LLM ni API keys
 *
 * Reemplaza a groq/compound (descontinuado 21-sep-2026) como fuente de datos
 * reales para el pipeline MoA. Trae snippets compactos de fuentes reales;
 * el LLM luego solo SINTETIZA — no puede inventar URLs porque solo recibe
 * las que efectivamente se fetchearon.
 *
 * Fuentes (todas gratis, sin key, CI-friendly):
 * - Google News RSS     → noticias ordenadas por fecha, locale configurable.
 *                         Operador site: para filtrar por dominio de confianza
 *                         (who.int, paho.org, scielo.org, cepal.org — verificado).
 * - RSS institucional   → feeds directos de fuentes confiables (Mayo Clinic…).
 * - GDELT 2.0 DOC API   → filtro domain: (opcional, rate-limited, tolerado).
 * - PubMed E-utilities  → papers con DOI/PMID real (estadísticas clínicas).
 *
 * Uso:
 *   import { fetchNewsBundle } from "./news-fetch.mjs";
 *   const bundle = await fetchNewsBundle({ newsQueries: [...], gdeltQuery, pubmedQuery, trustedDomains });
 *
 * CLI (smoke test):
 *   node scripts/news-fetch.mjs "caregiver burnout elderly"
 */

const FETCH_TIMEOUT_MS = 15000;
const UA = "BienCuidar-ContentPipeline/1.0 (+https://biencuidar.agtisa.com)";

// ── HTTP helpers con timeout ──
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url) {
  return JSON.parse(await fetchText(url));
}

// ── XML helpers (regex-based, suficiente para RSS/Atom) ──
function stripXml(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normTitle(t = "") {
  return t.toLowerCase().replace(/[^a-z0-9áéíóúñü ]/gi, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

// Normalizar dominio: "https://www.who.int/x" → "who.int"
function normDomain(d = "") {
  return d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

// Parsear bloques <item> de un RSS/Atom a objetos normalizados
function parseRSSItems(xml, { maxItems = 10, kind = "news", defaultSource = "", defaultDomain = "" } = {}) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = stripXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const link = stripXml(block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]);
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || block.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "").trim();
    const srcMatch = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const snippet = stripXml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]).slice(0, 300);
    if (!title) continue;
    items.push({
      kind,
      title,
      url: link,
      source: stripXml(srcMatch?.[2] || "") || defaultSource,
      domain: normDomain(srcMatch?.[1] || "") || defaultDomain,
      date: pubDate,
      snippet,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════
// Google News RSS — búsqueda ordenada por fecha, sin key
// Soporta operador site: → "query site:who.int" filtra por dominio
// ═══════════════════════════════════════════════════════════════
export async function fetchGoogleNews(query, { lang = "es", country = "SV", maxItems = 8 } = {}) {
  const ceid = `${country}:${lang}`;
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${lang}&gl=${country}&ceid=${encodeURIComponent(ceid)}`;

  const xml = await fetchText(url);
  return parseRSSItems(xml, { maxItems });
}

// Google News con filtro por dominio (site:) — verificado funcional
// en who.int, paho.org, scielo.org, cepal.org, alz.org (26-100 items/query)
export async function fetchSiteNews(query, domain, { lang = "en", country = "US", maxItems = 4 } = {}) {
  return fetchGoogleNews(`${query} site:${domain}`, { lang, country, maxItems });
}

// ═══════════════════════════════════════════════════════════════
// RSS directo de fuentes de confianza (primera fuente, sin key)
// Solo feeds verificados funcionales — agregar más probando antes.
// ═══════════════════════════════════════════════════════════════
export const TRUSTED_RSS_FEEDS = [
  {
    url: "https://newsnetwork.mayoclinic.org/feed/",
    source: "Mayo Clinic News Network",
    domain: "mayoclinic.org",
  },
];

export async function fetchRSSFeed(feed, { maxItems = 6 } = {}) {
  const xml = await fetchText(feed.url);
  return parseRSSItems(xml, { maxItems, kind: "article", defaultSource: feed.source, defaultDomain: feed.domain });
}

// ═══════════════════════════════════════════════════════════════
// GDELT 2.0 DOC API — gratis, sin key, soporta domain: y sourcelang:
// https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/
// ═══════════════════════════════════════════════════════════════
export async function fetchGDELT(query, { maxRecords = 15, timespan = "6m" } = {}) {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=${maxRecords}&timespan=${timespan}&sort=hybridrel`;

  const data = await fetchJSON(url);
  return (data.articles || []).map((a) => ({
    kind: "article",
    title: a.title || "",
    url: a.url || "",
    source: a.domain || "",
    domain: a.domain || "",
    date: a.seendate || "",
    snippet: "",
  }));
}

// GDELT con filtro a dominios de confianza: "topic (domain:a OR domain:b ...)"
export function gdeltDomainQuery(topicQuery, domains) {
  const domClause = domains.map((d) => `domain:${d}`).join(" OR ");
  return `${topicQuery} (${domClause})`;
}

// ═══════════════════════════════════════════════════════════════
// PubMed E-utilities — gratis, sin key (3 req/s)
// ═══════════════════════════════════════════════════════════════
export async function fetchPubMed(query, { retmax = 5, minYear = 2021 } = {}) {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

  const esearch = await fetchJSON(
    `${base}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}` +
      `&retmode=json&retmax=${retmax}&sort=relevance&datetype=pdat&mindate=${minYear}&maxdate=2026`
  );
  const ids = esearch?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const summ = await fetchJSON(
    `${base}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
  );

  const items = ids
    .map((id) => {
      const r = summ?.result?.[id];
      if (!r) return null;
      return {
        kind: "pubmed",
        pmid: id,
        title: stripXml(r.title || ""),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: r.fulljournalname || r.source || "PubMed",
        domain: "pubmed.ncbi.nlm.nih.gov",
        date: r.pubdate || "",
        doi: (r.elocationid || "").replace(/^doi:\s*/i, ""),
        snippet: "",
      };
    })
    .filter(Boolean);

  // Traer abstracts de los primeros 3 (ahí están las estadísticas)
  try {
    const xml = await fetchText(
      `${base}/efetch.fcgi?db=pubmed&id=${ids.slice(0, 3).join(",")}&rettype=abstract&retmode=xml`
    );
    for (const block of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
      const pmid = block[1].match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
      const item = items.find((i) => i.pmid === pmid);
      if (!item) continue;
      const abstract = [...block[1].matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((mm) => stripXml(mm[1]))
        .join(" ")
        .slice(0, 1400);
      if (abstract) item.snippet = abstract;
    }
  } catch {
    // abstracts son nice-to-have; los títulos ya sirven
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════
// Bundle: todas las fuentes en paralelo, dedup, tolerante a fallos
// ═══════════════════════════════════════════════════════════════
// opts:
//   newsQueries: [{ q, lang, country }]          → Google News RSS por cada una
//   siteQueries: [{ q, domains, lang, country }] → GN site: por dominio de confianza
//   trustedFeeds: bool                           → RSS directo de fuentes confiables
//   gdeltQuery:  string                          → GDELT abierto (opcional, 429 tolerado)
//   pubmedQuery: string                          → PubMed
//   trustedDomains: string[]                     → ranking + GDELT domain:
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchNewsBundle({ newsQueries = [], siteQueries = [], trustedFeeds = false, gdeltQuery = "", pubmedQuery = "", trustedDomains = [] } = {}) {
  const tasks = [];

  for (const nq of newsQueries) {
    tasks.push({ name: `GoogleNews(${nq.lang})`, run: () => fetchGoogleNews(nq.q, nq) });
  }
  // site:scoped — filtro por dominio de confianza vía Google News
  for (const sq of siteQueries) {
    for (const d of sq.domains || []) {
      tasks.push({
        name: `SiteNews(${d})`,
        run: () => fetchSiteNews(sq.q, d, { lang: sq.lang, country: sq.country, maxItems: sq.perDomain || 4 }),
      });
    }
  }
  if (trustedFeeds) {
    for (const feed of TRUSTED_RSS_FEEDS) {
      tasks.push({ name: `RSS(${feed.domain})`, run: () => fetchRSSFeed(feed) });
    }
  }
  if (pubmedQuery) {
    tasks.push({ name: "PubMed", run: () => fetchPubMed(pubmedQuery) });
  }

  // GDELT va aparte: su API pública rate-limita agresivamente (~1 req / 4s,
  // y aun así suele dar 429). Fuente opcional — su fallo se tolera.
  const gdeltTasks = [];
  if (gdeltQuery) {
    gdeltTasks.push({ name: "GDELT", run: () => fetchGDELT(gdeltQuery) });
    if (trustedDomains.length > 0) {
      gdeltTasks.push({
        name: "GDELT(trusted)",
        run: () => fetchGDELT(gdeltDomainQuery(gdeltQuery, trustedDomains), { maxRecords: 15, timespan: "1y" }),
      });
    }
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const allTasks = [...tasks];

  for (const t of gdeltTasks) {
    await sleep(4000); // respetar rate limit de GDELT
    try {
      settled.push({ status: "fulfilled", value: await t.run() });
    } catch (reason) {
      settled.push({ status: "rejected", reason });
    }
    allTasks.push(t);
  }

  const items = [];
  const failed = [];
  const stats = {};
  settled.forEach((res, i) => {
    const name = allTasks[i].name;
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      stats[name] = res.value.length;
      items.push(...res.value);
    } else {
      stats[name] = 0;
      failed.push(`${name}: ${res.reason?.message || res.status}`);
    }
  });

  // Dedup por URL y por título normalizado (GN es/en trae duplicados)
  const seenUrl = new Set();
  const seenTitle = new Set();
  const deduped = items.filter((it) => {
    const key = it.url || normTitle(it.title);
    const tk = normTitle(it.title);
    if (!key || seenUrl.has(key) || seenTitle.has(tk)) return false;
    seenUrl.add(key);
    if (tk) seenTitle.add(tk);
    return true;
  });

  // Orden: pubmed (papers) → dominios de confianza → news general
  const rank = (it) =>
    it.kind === "pubmed" ? 0 : trustedDomains.some((d) => it.domain === d || it.domain.endsWith("." + d)) ? 1 : 2;
  deduped.sort((a, b) => rank(a) - rank(b));

  return {
    items: deduped,
    fetchedUrls: new Set(deduped.map((i) => i.url).filter(Boolean)),
    stats,
    failed,
  };
}

// Formatear items como lista numerada para inyectar al prompt del LLM
export function formatBundleForPrompt(bundle, { maxItems = 15, snippetLen = 400 } = {}) {
  return bundle.items
    .slice(0, maxItems)
    .map((it, i) => {
      const date = (it.date || "").slice(0, 25);
      const head = `[${i + 1}] (${it.kind}) ${it.title}\n    Source: ${it.source} | ${date}\n    URL: ${it.url}`;
      return it.snippet ? `${head}\n    ${it.snippet.slice(0, snippetLen)}` : head;
    })
    .join("\n\n");
}

// Extraer URLs presentes en un texto
export function extractUrls(text = "") {
  return text.match(/https?:\/\/[^\s)\]"'<>]+/g) || [];
}

// ═══════════════════════════════════════════════════════════════
// CLI smoke test: node scripts/news-fetch.mjs "caregiver burnout"
// ═══════════════════════════════════════════════════════════════
if (process.argv[1] && process.argv[1].endsWith("news-fetch.mjs")) {
  const q = process.argv[2] || "caregiver burnout elderly Latin America";
  console.log(`Fetching bundle for: "${q}"\n`);
  const bundle = await fetchNewsBundle({
    newsQueries: [
      { q, lang: "es", country: "SV" },
      { q, lang: "en", country: "US" },
    ],
    gdeltQuery: q,
    pubmedQuery: q,
    trustedDomains: ["who.int", "paho.org", "nih.gov", "cdc.gov", "cepal.org"],
  });
  console.log("Stats:", JSON.stringify(bundle.stats));
  if (bundle.failed.length) console.log("Failed:", bundle.failed.join("; "));
  console.log(`\n${bundle.items.length} items:\n`);
  console.log(formatBundleForPrompt(bundle));
}
