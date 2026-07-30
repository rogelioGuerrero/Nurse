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

## Deprecated — Never Use

- `llama-3.3-70b-versatile` (deprecated by Groq 16 Aug 2026)
- `llama-3.1-8b-instant` (deprecated by Groq 16 Aug 2026)
- `meta-llama/llama-prompt-guard-2-86m` (use `gpt-oss-safeguard-20b` instead)
- `qwen/qwen3-32b` — leaks reasoning, ignores formatting rules, unstable rate limits

## Fallback

- `_shared/groq.ts` already provides automatic fallback via `callGroqRaw` and `callGroq` using `[PRIMARY_MODEL, FALLBACK_MODEL]`.
- Edge functions using the default `callGroq`/`callGroqRaw` calls already get fallback to `gpt-oss-20b`.

## Compound (`groq/compound`)

- **Do not call Compound from Supabase Edge Functions** — it returns 413 due to request expansion.
- Call Compound directly from local scripts with very short prompts (≤2 lines, ~300 chars, no `max_tokens`/`temperature`).
- Wait 30–45 s between Compound calls to respect free-tier TPM.

## Reasoning Tokens

`gpt-oss-120b` consumes `max_tokens` for internal reasoning tokens that do not appear in `content`. Allow generous headroom:

- Redaction / review / edit: `max_tokens: 4000`
- QA / final approval: `max_tokens: 2000`
- Teaser: `max_tokens: 1000`

## Rate Limits (Free Tier)

- `gpt-oss-120b`: 30 RPM, 8000 TPM, 250 requests/day
- Compound uses ~6000 TPM internally; wait **65 s** after Compound before next agent.
- Wait **20 s** between consecutive `gpt-oss-120b` agent calls.

## smolagents

- **Do not use smolagents with Groq.** `gpt-oss` models are optimized for function calling, not code generation, and clash with `tool_choice: "required"`.
- If a future project needs `smolagents`, use it with Qwen2.5-Coder-32B, DeepSeek-Coder-V2, or Llama 3.3 70B via Together/HF/Ollama — not Groq.
