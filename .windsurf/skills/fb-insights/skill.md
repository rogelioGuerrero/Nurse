---
name: fb-insights
description: Leer métricas de Facebook para BienCuidar
---

# Leer métricas de Facebook

## Comando

```powershell
node scripts/fb-insights.mjs
```

## Qué hace

- Llama a la Edge Function `fb-insights` de Supabase.
- Obtiene los últimos posts de la página con métricas (impressions, reactions, engagement).
- Escribe un resumen en `scripts/fb-insights-summary.txt`.
- `editorial-scout.mjs` lee ese resumen automáticamente en la fase PROPOSE.

## Permisos requeridos

El `FB_PAGE_TOKEN` necesita permisos de Facebook Graph API:

- `read_insights`
- `pages_read_engagement`
- `pages_show_list`

Sin estos permisos la función devuelve los posts pero todas las métricas son `0`.

## Notas

- Métricas disponibles: alcance, engagement, reacciones por post, etc.
- Verificar lista actual de métricas en https://developers.facebook.com/docs/graph-api/reference/insights/
