# AGENTS.md — BienCuidar (LocalNurse)

## Project Identity

- **Repo:** `rogelioGuerrero/Nurse`
- **Production:** https://biencuidar.agtisa.com
- **Stack:** React 19 + Vite 6 + TypeScript + Supabase (PostgreSQL/Auth/RLS/Realtime/Edge Functions) + TailwindCSS v4
- **Supabase project ref:** `zqgtkrqfyhcvgagjhbnv` (managed via `mcp7_*` tools)

## Architecture Conventions

### Frontend
- `src/context/AppContext.tsx` holds global auth, realtime subscriptions, and profile sync only.
- Domain logic lives in `src/hooks/` (`useBookings`, `useMarketplace`, `useReviews`, `useAvailability`).
- Components import state through `useApp()`; the `AppContextType` interface is the public contract.
- Types live in `src/types.ts`.

### Backend (Edge Functions)
- Shared LLM logic is in `supabase/functions/_shared/groq.ts`.
- **Important:** `mcp7_deploy_edge_function` does not resolve `../_shared/` imports. Inline shared code into the deployed `index.ts` when deploying through MCP; keep `../_shared/groq.ts` imports for local development only.
- Functions invoked by cron/webhooks/internal callers MUST set `verify_jwt: false` and authenticate via their own secret header (`x-api-key` / `x-cron-secret`).

### Database
- Migrations go in `supabase/migrations/` and are applied with `mcp7_apply_migration`.
- Use atomic RPCs for critical marketplace operations (e.g., `accept_offer(UUID)`).
- Realtime subscriptions are wired in `AppContext.tsx` using hook setters.

### State & UX Patterns
- **Optimistic UI:** update local state immediately, then write async to DB, then roll back on failure.
- **Notifications:** only trigger after DB write success is confirmed.
- **Expiration:** server-side cron is the source of truth; client only mirrors state.

### Build / Deploy
- Netlify build uses `npm run build` which injects `prerendered-root.html` (no Puppeteer on Netlify).
- Regenerate `prerendered-root.html` locally with `npm run build:prerender` whenever `LandingPage` content changes.
  - `build` → `vite build && node scripts/apply-prerender.mjs` (no Puppeteer)
  - `build:prerender` → `vite build && node scripts/prerender.mjs && node scripts/extract-root.mjs` (local, regenera el HTML)
  - Puppeteer was removed from `devDependencies`; install temporarily only when re-prerendering: `npm install puppeteer`.
- `scripts/` is gitignored and treated as local tooling; do not commit generated artifacts.

## Domain Quick Reference

### Billing Flow
- Family sees final price: nurse rate + `$5.65` management fee (with invoice).
- Nurse sees net: rate × `0.90` (10% ISR withheld, invoice path only).
- **Direct-pay path:** no commission, no ISR, family pays nurse directly.

## Image Branding for Facebook

- Run `node scripts/add-branding.mjs "<image>" [--output "<out>"]` before publishing.
- Adds bottom gradient, indigo stethoscope icon, "BienCuidar" text, and URL overlay using `sharp`.
- The Gemini/Nano Banana prompt must NOT ask for text/logos; add branding post-generation.
- Complete flow:
  ```
  groq-news.mjs → article + gemini-prompt.txt
  generate image in Nano Banana with Omni prompt
  node scripts/add-branding.mjs "image.png"
  node scripts/fb-post.mjs "image_branded.png" @scripts/generated-article.txt
  ```

## Video Branding for Facebook

- Two-script pipeline: `gen-cards.mjs` (pre-render intro/CTA cards) + `add-branding-video.mjs` (overlay + assemble).
- Requires `ffmpeg-static` and `sharp` (devDependencies, project-local binaries — no system-wide install). `ffprobe` is NOT included in `ffmpeg-static`; scripts probe via `ffmpeg -i` (parses stderr).
- Re-encodes with `libx264 crf=23 preset=veryfast` + AAC 128k + `yuv420p` + `+faststart` for web streaming.
- Same rule as images: the Gemini/Nano Banana video prompt must NOT ask for text/logos; add branding post-generation.

### `gen-cards.mjs` — Pre-rendered cards
- Generates `scripts/.cards/intro.mp4` (2s, Ken Burns zoom, reutilizable para todos los videos) and `scripts/.cards/cta.mp4` (5s, sin zoom para legibilidad).
- CTA text auto-extracted from `scripts/generated-article.txt` or via `--cta "texto"`.
- Dimensions/FPS auto-detected from `--ref video.mp4` (default 1280x720@24fps).
- Cards have fade in/out from black (0.4s intro, 0.5s CTA).
- Usage: `node scripts/gen-cards.mjs --ref clip1.mp4 [--cta "texto"]`

### `add-branding-video.mjs` — Ensamblaje final
- Reads pre-rendered `intro.mp4` + `cta.mp4` from `scripts/.cards/`.
- Applies branding overlay (bottom gradient, stethoscope icon, "BienCuidar" text, URL) to each clip via `ffmpeg-static`.
- All clips get fade in/out through black (0.4s) for clean transitions between segments.
- Concatenates: `intro → clip1 → clip2 → ... → cta` using concat demuxer.
- Usage: `node scripts/add-branding-video.mjs clip1.mp4 [clip2.mp4 ...] [--output path] [--crf 23] [--preset veryfast]`

### Complete flow (video path):
  ```
  groq-news.mjs → article + gemini-video-prompt.txt
  generate video clips in Gemini
  node scripts/gen-cards.mjs --ref clip1.mp4
  node scripts/add-branding-video.mjs clip1.mp4 clip2.mp4 --output final.mp4
  publish manually on Facebook with text from scripts/generated-article.txt
  ```

## Key Constants
- `PLATFORM_COMMISSION = $5`
- `IVA_RATE = 13%` on commission only
- `RETENTION_RATE = 10%` ISR on nurse rate

## See Also

- `.devin/rules/*.md` for behavioral rules.
- `.devin/skills/*.md` for reusable task instructions.
