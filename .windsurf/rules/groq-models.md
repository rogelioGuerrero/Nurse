---
description: Groq model selection, fallback, and deprecation rules
---

# Groq Model Usage

## Approved Models

Use only these production models in BienCuidar code:

| Role | Model | Notes |
|------|-------|-------|
| Primary | `openai/gpt-oss-120b` | Triaje, chat, agent, MoA redaction/review/edit |
| Fallback / light | `openai/gpt-oss-20b` | QA, PII extraction, classification, memory extraction |
| Safety | `openai/gpt-oss-safeguard-20b` | Jailbreak and content safety checks |

## Vision Model

| Role | Model | Notes |
|------|-------|-------|
| OCR / image extraction | `qwen/qwen3.8-27b` | Text+image, 131K context, thinking/instruct modes |

Used in `rag-ingest` for extracting text from images (medical documents, legal docs).
Supports up to 3 images per request, 20 MB max per image.
Same OpenAI-compatible vision API format (content array with `type: "image_url"`).

## Deprecated — Never Use

- `groq/compound` (decommissioned 21 Sep 2026 — use `browser_search` tool on `gpt-oss-120b`)
- `groq/compound-mini` (decommissioned 21 Sep 2026 — use `browser_search` tool on `gpt-oss-120b`)
- `qwen/qwen3.6-27b` (deprecated 14 Sep 2026 — use `qwen/qwen3.8-27b`)
- `llama-3.3-70b-versatile` (deprecated by Groq 16 Aug 2026)
- `llama-3.1-8b-instant` (deprecated by Groq 16 Aug 2026)
- `meta-llama/llama-3.2-90b-vision-preview` (decommissioned — use `qwen/qwen3.8-27b`)
- `meta-llama/llama-3.2-11b-vision-preview` (decommissioned — use `qwen/qwen3.8-27b`)
- `meta-llama/llama-4-scout-17b-16e-instruct` (deprecated 17 Jul 2026 — use `qwen/qwen3.8-27b`)
- `meta-llama/llama-prompt-guard-2-86m` (use `gpt-oss-safeguard-20b` instead)
- `qwen/qwen3-32b` — leaks reasoning, ignores formatting rules, unstable rate limits

## Fallback

- `_shared/groq.ts` already provides automatic fallback via `callGroqRaw` and `callGroq` using `[PRIMARY_MODEL, FALLBACK_MODEL]`.
- Edge functions using the default `callGroq`/`callGroqRaw` calls already get fallback to `gpt-oss-20b`.

## Search / Retrieval Layer (`scripts/news-fetch.mjs`)

`groq/compound` and `groq/compound-mini` were decommissioned 21 Sep 2026. Instead of another bundled vendor system, retrieval is owned code:

- **Google News RSS** — real news sorted by date, free, no key, locale-configurable (`hl`/`gl`/`ceid`).
- **GDELT 2.0 DOC API** — free, no key, `domain:` filter for trusted domains. Rate-limited (429) — treat as optional source.
- **PubMed E-utilities** — free, no key (~3 req/s). Best source for clinical stats: esearch → esummary → efetch abstracts.

Pattern: fetch real material (pure HTTP, ~0 tokens) → `gpt-oss-120b` synthesizes a research brief using ONLY the fetched items → deterministic QC: every URL cited in the brief must exist in the fetched set.

- `browser_search` (built-in tool on gpt-oss) remains ONLY as fallback when retrieval returns <3 items — it works but pulls full pages (~170K prompt tokens/call).
- Total pipeline search cost: ~5-8K tokens vs ~170K with browser_search.

## Reasoning Tokens

`gpt-oss-120b` consumes `max_tokens` for internal reasoning tokens that do not appear in `content`. Allow generous headroom:

- Redaction / review / edit: `max_tokens: 4000`
- QA / final approval: `max_tokens: 2000`
- Teaser: `max_tokens: 1000`

## Rate Limits (Free Tier)

- `gpt-oss-120b`: 30 RPM, 8000 TPM, 250 requests/day
- Retrieval layer (RSS/GDELT/PubMed): no Groq tokens; keep the 65 s delay only if `browser_search` fallback triggers (pulls full pages, ~170K tokens).
- Wait **20 s** between consecutive `gpt-oss-120b` agent calls.

## smolagents

- **Do not use smolagents with Groq.** `gpt-oss` models are optimized for function calling, not code generation, and clash with `tool_choice: "required"`.
- If a future project needs `smolagents`, use it with Qwen2.5-Coder-32B, DeepSeek-Coder-V2, or Llama 3.3 70B via Together/HF/Ollama — not Groq.
