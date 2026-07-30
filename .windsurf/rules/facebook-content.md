---
description: Facebook content pipeline, naming, and publishing rules
---

# Facebook Content — BienCuidar

## Naming Strategy

- **Public Facebook posts / families:** always say **"Benni"**. Never say "agente IA", "inteligencia artificial", or "agente autónomo" in CTAs or public copy.
- **Landing page:** "Benni, un asistente de voz que acompaña a tu familiar" (IA can be mentioned as backend technology, not the protagonist).
- **Investors / B2B pitch:** "Agente autónomo de IA especializado en cuidado de adultos mayores".
- **Insurers / clinics:** "Agente autónomo de IA con escalación automatizada a familiares".

## Editorial Pipeline (A0 → A5)

1. **A0 Scout:** `node scripts/editorial-scout.mjs` (or `--select N`)
2. **A1–A5 MoA:** `$env:GROQ_API_KEY="..."; node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt "próximo tema"`
3. **Image:** generate with Gemini Nano Banana using `scripts/gemini-prompt.txt`
4. **Branding:** `node scripts/add-branding.mjs "<imagen>"`
5. **Publish:** `node scripts/fb-post.mjs "<imagen_branded>" @scripts/generated-article.txt`

Run once per day; do not automate image generation.

## Rotating CTAs

Pick by keyword match (`pickCTA` in `groq-news.mjs`):

- **generic** — costo, economía, profesión, política
- **benni-recordatorios** — soledad, medicina, recordatorio, voz
- **benni-emergencia** — síntoma, dolor, caída, emergencia, riesgo
- **bitacora-enfermeria** — enfermera, cuidado, visita, transparencia, confianza

## Editorial Scout (A0)

```powershell
node scripts/editorial-scout.mjs
node scripts/editorial-scout.mjs --select N
```

- 3 phases: **SCAN** (Compound), **DIGEST**, **PROPOSE**.
- Active domains: D2 (política/derechos), D3 (mercado laboral), D4 (economía familiar), D6 (cuidador informal/género).
- Every proposal must have a news hook with a date; do not pad with weak ideas.
- The scout does not discard already-published topics — it proposes new angles on them.

## Translation of User Ideas

- User ideas are usually colloquial. Translate them into professional topics before using them as CLI arguments.
- The CLI topic should be descriptive and neutral; the editorial angle can reuse the user's phrase as a hook if it is strong.

## Content History

- Table `content_pipeline.content_history` in Supabase tracks generated and published posts.
- `editorial-scout.mjs` and `groq-news.mjs` write rows with `status='generated'`.
- `fb-post.mjs` updates the row to `status='published'`, `fb_post_id`, `image_path`, `published_at`.

## External Data Layers

- **Wolfram Alpha**: use only for universal curated data (nutrition, growth percentiles, math, LP). Do not use for local Salvadoran data (salaries, prices, policies).
- **Web search (Compound)**: use for regional sources (CEPAL, FAO, PAHO, INCAP, Scielo).
- **Human / own DB**: use for real inventory, prices, patient profiles.

## Facebook Graph API

- Graph API version: v19.0; endpoint base: `https://graph.facebook.com/v19.0/`.
- `FB_PAGE_ID` and `FB_PAGE_TOKEN` are Supabase env vars.
- Insights require `read_insights`, `pages_read_engagement`, and `pages_show_list` permissions.
- Some classic Page Insights metrics were deprecated in June 2026; verify current metrics at https://developers.facebook.com/docs/graph-api/reference/insights/

## Format Rules

- Spanish, 150–200 words, no markdown.
- 2–3 professional emojis per post. Preferred sets: `🩺 💙 🌐`, `🤔 🤝 👉`, `❤️‍🩹 🏡 📋`.
- Links with `https://` so Facebook recognizes them as clickable.
- CTA: `https://biencuidar.agtisa.com`
- Maximum 3 hashtags.
- Do not invent statistics; only use verifiable sources.

## Publishing Mechanics

- Image is read from local disk, compressed with sharp (resize 1200 px + JPEG 80%), converted to base64, and sent to `fb-publish` Edge Function.
- No Supabase Storage needed.
- The Edge Function uses `FB_PAGE_ID` and `FB_PAGE_TOKEN` env vars in Supabase.

## Scripts Are Local

- Everything under `scripts/` is local tooling and gitignored. Do not commit generated articles, angles, or summaries.
