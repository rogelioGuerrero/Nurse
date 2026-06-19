# LocalNurse

Plataforma marketplace para conectar familias con enfermeras profesionales de cuidado del adulto mayor en El Salvador.

## Caracteristicas

- Busqueda y filtrado de enfermeras por especializacion, tarifa y ubicacion
- Mapa interactivo con cobertura geografica de El Salvador
- Sistema de reservas con calendario de disponibilidad
- Integracion con WhatsApp para comunicacion directa familia-enfermera
- Asistente clinico con IA (Groq + Llama-3)
- Calculadora tributaria de El Salvador (Art. 156 Codigo Tributario)
- Sello de Confianza: verificacion de PNC, Antecedentes Penales, CSSP y DUI
- Integracion con Supabase (PostgreSQL + RLS + Auth)

## Stack

- React 19 + Vite 6
- TailwindCSS v4
- Supabase (PostgreSQL, Auth, RLS)
- Groq AI (Llama-3)
- TypeScript

## Ejecutar Localmente

**Prerequisitos:** Node.js 18+

1. Instalar dependencias:
   `npm install`
2. Copiar `.env.example` a `.env.local` y configurar las claves:
   - `VITE_GROQ_API_KEY` - clave de Groq AI (https://console.groq.com/keys)
   - `VITE_SUPABASE_URL` - URL del proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` - clave anon de Supabase
3. Ejecutar:
   `npm run dev`
4. Abrir http://localhost:3000

## Despliegue

El proyecto incluye configuracion de Netlify (`netlify.toml`) con build y headers de seguridad.

```bash
npm run build
```

## Estructura

```
src/
  components/    Componentes UI (MapComponent, NurseDetail, BookingsManager, etc.)
  context/       AppContext - estado global y persistencia local
  data/          Datos iniciales mock (nurses, profiles)
  lib/           Configuracion de Supabase y Groq AI
  types.ts       Interfaces TypeScript del dominio
```
