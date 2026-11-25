# BienCuidar

Plataforma marketplace para conectar familias con enfermeras profesionales de cuidado del adulto mayor en El Salvador.

## Caracteristicas

- Busqueda y filtrado de enfermeras por especializacion, tarifa y ubicacion
- Mapa interactivo con cobertura geografica de El Salvador
- Sistema de solicitudes de cuidado (care requests) con ofertas de enfermeras
- Sistema de reservas con check-in/check-out GPS
- Integracion con WhatsApp para comunicacion directa familia-enfermera
- Asistente clinico con IA (Groq GPT-OSS 120B)
- Verificacion automatica de CSSP (Colegio Superior de Salud Publica)
- Calculadora tributaria de El Salvador (Art. 156 Codigo Tributario)
- Facturacion electronica con retencion ISR 10%
- Integracion con Supabase (PostgreSQL + RLS + Auth + Realtime)
- Pipeline de contenido para Facebook (MoA + Compound + editorial scout)

## Stack

- React 19 + Vite 6
- TailwindCSS v4
- Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions)
- Groq AI (GPT-OSS 120B / GPT-OSS 20B / GPT-OSS Safeguard 20B)
- TypeScript

## Ejecutar Localmente

**Prerequisitos:** Node.js 18+

1. Instalar dependencias:
   `npm install`
2. Copiar `.env.example` a `.env` (o `.env.local`) y configurar las claves:
   - `VITE_SUPABASE_URL` - URL del proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` - clave anon de Supabase
3. Ejecutar:
   `npm run dev`
4. Abrir http://localhost:3000

## Calidad y operacion

- `npm test`: pruebas de precios (incluye paridad con la funcion SQL `accept_offer` y deteccion de comisiones hardcodeadas).
- CI (GitHub Actions): typecheck, tests y build en cada PR.
- Produccion se opera con `ops/`: `OPS_LOG.md` (cambios, verificacion, reversion), `INCIDENTS.md`, `queries.sql`, `smoke.mjs` (prueba segura sin credenciales), `AUTH_STANDARD.md` (como se autentica cada Edge Function) y `tests/` (pruebas SQL que se revierten solas).
- NUNCA invocar Edge Functions ni crons que notifiquen a usuarios reales para probar. Ver `supabase/functions/INVENTORY.md`.
- Politica de datos de salud: `docs/PHI_POLICY.md`.

## Despliegue

El proyecto incluye configuracion de Netlify (`netlify.toml`) con build y headers de seguridad. El prerendering de la landing page se hace localmente (sin Puppeteer en el build de Netlify).

```bash
npm run build              # build normal (usa prerendered-root.html)
npm run build:prerender    # regenera el prerender localmente (requiere puppeteer)
```

## Estructura

```
src/
  components/    Componentes UI (LandingPage, CareRequestForm, NurseInbox, etc.)
  context/       AppContext - estado global, realtime y persistencia
  data/          Datos estaticos (districts, platformSettings)
  hooks/         Hooks de dominio (useBookings, useMarketplace, useReviews, useAvailability, useWhisperSTT)
  lib/           Configuracion de Supabase
  types.ts       Interfaces TypeScript del dominio
supabase/
  functions/     Edge Functions (ai-agent, ai-chat, benni-chat, triage-request,
                 fb-publish, fb-story, rag-ingest, verify-cssp, email-inbound-handler)
  migrations/    Migraciones SQL (timestamp YYYYMMDDHHMMSS); baseline/ = foto de referencia del esquema de produccion (no aplicar)
scripts/         Herramientas locales de contenido para Facebook (groq-news.mjs, editorial-scout.mjs, fb-post.mjs)
ops/             Operacion de produccion (log de cambios, smoke test, diagnosticos, reversiones)
tests/           Pruebas (pricing.test.ts, editorial-evidence.test.mjs)
```
