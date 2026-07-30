---
description: Edge function deployment, auth, and cron rules
---

# Supabase Edge Functions

## Deployment

- Deploy with `mcp7_deploy_edge_function`.
- If the function imports `../_shared/groq.ts`, inline the shared code into `index.ts` for MCP deploys; keep normal imports for local dev.

## `verify_jwt` Policy

### Must be `false` (cron / webhook / internal / app-without-JWT)

- `cssp-reminders`
- `marketplace-cron`
- `patient-wellness-check`
- `check-voice-reminders`
- `email-inbound-handler`
- `send-nurse-email`
- `chat-summary`
- `benni-escalate`
- `send-push`
- `stt`
- `fb-story` (script local)
- `fb-insights` (script local)
- `cv-review` (app)

### Must be `true` (app with JWT auth)

- `verify-cssp`, `ai-chat`, `ai-agent`, `benni-chat`, `rag-ingest`, `rag-query`, `fb-publish`, `triage-request`, `notify-marketplace`

## Cron Authentication

- Supabase cron invokes functions without a user JWT.
- Always include the authentication header in `net.http_post`:
  - `marketplace-cron` → `x-cron-secret`
  - `cssp-reminders` → `x-api-key` with `CRON_SECRET`
- `net.http_post` reports "succeeded" even if the function returns 401, so verify via edge-function logs.

## cssp-reminders Specifics

- Re-verifies nurses with `cssp_email_count = 0` first.
- Sends up to 3 reminder emails at 72 h and 7-day intervals.
- Deactivates (`is_active = false`) after 3rd email + 48 h without response; never deletes.
- Inactivity alerts at 15 and 30 days without login.
- Sends admin summary only when called by scheduled cron, not when triggered manually by `monitor-agent` (`_manual_trigger: true`).

## Groq Caching

- Use `callGroqCached` (in `_shared/groq.ts`) as a drop-in replacement for `callGroq` where responses are stable.
- Table `ai_cache` keys by SHA-256 of `messages + temperature + maxTokens + responseFormat + model` with TTL and `hit_count`.
- Current TTLs:
  - `ai-chat`: 24 h
  - `triage-request`: 48 h
- `benni-chat` does not use caching because of its dynamic tool-calling loop.
- When deploying with `mcp7_deploy_edge_function`, inline the shared `groq.ts` code into `index.ts`.

## Monitor-Agent

- `monitor-agent` runs every 4 h with `verify_jwt: false`.
- It runs health checks, compiles a report, and gives a Groq agent up to 3 tool-calling turns.
- Tools: `send_admin_alert`, `send_admin_email`, `log_incident`, `resolve_incident`, `trigger_cron_now`, `fix_verify_jwt`, `get_function_logs`.
- Requires `SB_ACCESS_TOKEN` (Supabase Management API token; cannot start with `SUPABASE_`).
- Uses a 12-hour dedup window and a token-budget guard to avoid runaway loops.
- Logs each run to `monitor_incidents` with `monitor_heartbeat`.
