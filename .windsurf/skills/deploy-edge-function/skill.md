---
name: deploy-edge-function
description: Deployar una Edge Function de Supabase para BienCuidar
---

# Deployar Edge Function

## Inlining de código compartido

`mcp7_deploy_edge_function` **no resuelve** imports de `../_shared/`.

- Si la función usa `supabase/functions/_shared/groq.ts`, inlinear el contenido de `groq.ts` dentro del `index.ts` que se va a deployar.
- En desarrollo local, mantener el import normal `from "../_shared/groq.ts"`.

## Autenticación (`verify_jwt`)

- **Cron / webhook / interna / app sin JWT**: `verify_jwt: false`. Ejemplos: `cssp-reminders`, `marketplace-cron`, `email-inbound-handler`, `send-push`, `stt`.
- **App con JWT**: `verify_jwt: true`. Ejemplos: `ai-chat`, `ai-agent`, `benni-chat`, `fb-publish`, `triage-request`, `notify-marketplace`.

## Comando

```
mcp7_deploy_edge_function(
  project_id: "zqgtkrqfyhcvgagjhbnv",
  name: "<function-name>",
  entrypoint_path: "index.ts",
  verify_jwt: <true|false>,
  files: [
    { name: "index.ts", content: "..." },
    { name: "deno.json", content: "..." }
  ]
)
```

## Verificación post-deploy

- Revisar logs de `edge-function` en Supabase.
- Si es función cron, verificar que `net.http_post` envía el header correcto (`x-cron-secret` o `x-api-key`).
