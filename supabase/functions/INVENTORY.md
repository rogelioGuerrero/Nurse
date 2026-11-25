# Edge Functions inventory (prod `zqgtkrqfyhcvgagjhbnv`, snapshot 2026-11-25)

Rule: NEVER invoke these manually against prod. Several send push/email to real users.
`verify_jwt=false` means the URL is publicly callable; the function must authenticate itself (secret header).

| Function | verify_jwt | In repo | Sends to users | In-code auth observed |
|---|---|---|---|---|
| ai-agent, ai-chat, benni-chat, triage-request, rag-ingest, rag-query | true | yes | no | JWT |
| verify-cssp | true | yes | email | JWT |
| notify-marketplace | true | yes | push/email | JWT |
| fb-publish | true | yes | FB page | JWT |
| fb-info | true | NO | no | JWT |
| marketplace-cron, cssp-reminders, check-voice-reminders, monitor-agent | false | yes | push/email | secret header (cron) |
| send-push, send-nurse-email, email-inbound-handler, benni-escalate, patient-token, stt, fb-story | false | yes | push/email | to verify per function |
| patient-wellness-check | false | yes (added) | PUSH to families | NONE (cron every 30 min) |
| patient-weekly-summary | false | yes (added) | PUSH to families (on POST) | NONE (cron weekly) |
| cv-review | false | NO | no | NONE (open Groq proxy) |
| chat-summary | false | NO | no | NONE (open Groq proxy) |
| groq-news | false | NO | no | NONE (open Groq proxy) |
| fb-insights, fb-post-metrics | false | NO | no | NONE (exposes FB page data) |

Sources still missing from the repo (retrieve with `get_edge_function`, sha256 of deployed bundle):
- fb-info `93d2f945...`, fb-insights `7044a3093...`, cv-review `dfb552dd...`, fb-post-metrics `dab7d544...`,
  chat-summary `d8120238...`, groq-news `782d2a62...`

Known gaps to fix (tracked in the management plan):
1. Add secret-header auth to patient-wellness-check / patient-weekly-summary and update their cron jobs together.
2. Protect or remove cv-review, groq-news, fb-insights, fb-post-metrics, fb-info: not referenced by `src/` (only by local scripts/CI; verify before removing). chat-summary IS used by `src/components/SupportChat.tsx` (keep; add rate limiting or JWT).
3. Deployed versions of repo functions inline `_shared`; repo and prod can drift.
