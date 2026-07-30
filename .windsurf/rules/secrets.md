---
description: Secret handling for BienCuidar
---

# Secrets

## Where Secrets Live

- Supabase Edge Functions env vars: `PATIENT_TOKEN_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SB_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_PAGE_TOKEN`.
- Local scripts read `GROQ_API_KEY` from the shell env: `$env:GROQ_API_KEY="..."`.

## Rules

- **Never commit secret values** to the repo, to AGENTS.md, or to rule files.
- Reference secrets only by env-var name in code and documentation.
- `GROQ_API_KEY` is provided by the user per session; do not hardcode it.
- Use `.env.example` for key names without values.
