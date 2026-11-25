# Auth standard for Edge Functions (single mechanism, decided 2026-11-25)

Every function must authenticate its caller in code (gateway `verify_jwt` is not enough: the anon key is a valid JWT).
Exactly three caller identities exist, checked in this order:

| Identity | How it is sent | Who uses it | Check |
|---|---|---|---|
| `service` | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` | other Edge Functions (server-to-server) | bearer === service key |
| `cron` | `x-cron-secret: <Vault cron_secret>` (env `CRON_SECRET`) | pg_cron jobs | header === CRON_SECRET |
| `user` | `Authorization: Bearer <user access_token>` | the web app | `auth.getUser(token)` succeeds (+ ownership check on the target row/user_id) |
| `patient` (only benni-escalate, stt, benni-chat flow) | `x-patient-token` (HMAC token from patient-token) | patient device | HMAC verify, id must match target |

Rules
1. Reject with 401 BEFORE parsing the body or touching data. 403 when authenticated but not the owner.
2. Functions that can notify people (send-push, send-nurse-email, check-voice-reminders cron mode, patient-wellness-check, patient-weekly-summary, cssp-reminders, notify-marketplace, benni-escalate) accept ONLY the identities listed in `supabase/functions/INVENTORY.md`.
3. Health probes must send `{"_health_check": true}` and the function must return 200 without doing work (see cssp-reminders).
4. No LLM-driven tool may change configuration (verify_jwt, secrets) or trigger a function outside an explicit allowlist (monitor-agent: `marketplace-cron` only).
5. Secrets live in Vault / Edge secrets, never in migrations or cron text. Rotation: `vault.update_secret` + matching Edge secret.
6. Every new/changed function: add a no-credentials case to `ops/smoke.mjs` (body must be harmless if the function were open), run it, log in `ops/OPS_LOG.md`.

Canonical snippet (copy inline; `_shared` is not resolved by MCP deploys):
```ts
const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
const isService = !!bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cron = Deno.env.get("CRON_SECRET");
const isCron = !!cron && req.headers.get("x-cron-secret") === cron;
let userId: string | null = null;
if (!isService && !isCron && bearer) userId = (await supabase.auth.getUser(bearer)).data?.user?.id ?? null;
if (!isService && !isCron && !userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
```
