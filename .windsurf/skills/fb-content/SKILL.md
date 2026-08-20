---
name: fb-content
description: Generar contenido de Facebook para BienCuidar con el pipeline MoA de 5 agentes
---

# Workflow: Generación de contenido de Facebook (MoA 5 agentes + Teaser)

## Pre-requisitos

- `GROQ_API_KEY` seteada en el entorno (PowerShell: `$env:GROQ_API_KEY="..."`)
- Node.js instalado
- Proyecto en `d:\proyectoBolt\LocalNurse`

## Paso 1: Definir tema y ángulo editorial

- Elegir tema de la serie de contenido vigente (ver `.devin/rules/facebook-content.md`).
- Escribir ángulo narrativo en `scripts/editorial-angle.txt` con 5 campos: `GANCHO / TONO / AUDIENCIA / DATOS_CLAVE / CIERRE`.
- Si el usuario da una idea suelta, traducirla a un tema profesional. No usar la frase literal como argumento CLI; sí usarla como gancho si es potente.

## Paso 2: Scout (A0) — opcional

```powershell
node scripts/editorial-scout.mjs
node scripts/editorial-scout.mjs --select N
```

## Paso 3: Generar artículo con MoA

```powershell
$env:GROQ_API_KEY="..."; node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt "próximo tema"
```

### Pipeline state-graph

```
SEARCH → WRITE → REVIEW → EDIT → APPROVE → TEASER → END
           ↑        |         |        |
           ← REESCRIBIR        ← RECHAZADO
← BUSCAR_MAS ─────┘
```

### Agentes y modelos

| # | Rol | Modelo | max_tokens | Función |
|---|---|---|---|---|
| 1 | Busca | `groq/compound` | — | Web search en fuentes autorizadas |
| 2 | Redacta | `openai/gpt-oss-120b` | 4000 | Borrador desde ángulo estructurado |
| 3 | Revisa | `openai/gpt-oss-120b` | 4000 | Fact-check + evaluación ética |
| 4 | Edita | `openai/gpt-oss-120b` | 4000 | Pulido editorial |
| 5 | Aprueba | `openai/gpt-oss-20b` | 2000 | QA final: checklist |
| 6 | Teaser | `openai/gpt-oss-20b` | 1000 | Cliffhanger para próximo tema |

### Feedback loops (máx 2 iteraciones)

- Agente 3 → `BUSCAR_MAS` → Agente 1
- Agente 3 → `REESCRIBIR` → Agente 2
- Agente 5 → `RECHAZADO` → Agente 4

### Delays anti rate-limit

- Post-Compound → WRITE: **65 s**
- Entre agentes 2–5: **20 s**

### Fuentes autorizadas

who.int, paho.org, mayoclinic.org, nih.gov, cdc.gov, alz.org, cepal.org, worldbank.org, pubmed.ncbi.nlm.nih.gov, scielo.org

## Paso 4: Revisar artículo generado

- Abrir `scripts/generated-article.txt`.
- Verificar: 150–200 palabras, español, sin markdown, 2–3 emojis profesionales, CTA, ≤3 hashtags, datos verificables.
- El CTA rotativo se elige automáticamente según keywords del tema.

## Paso 5: Generar imagen

- Copiar prompt de `scripts/gemini-prompt.txt`.
- Pegar en Gemini Nano Banana.
- Guardar imagen localmente.
- Agregar branding: `node scripts/add-branding.mjs "<ruta-imagen>"`

## Paso 6: Publicar en Facebook

```powershell
node scripts/fb-post.mjs "<ruta-imagen-branded>" @scripts/generated-article.txt
```

## Notas

- Frecuencia: una vez al día.
- No automatizar (la imagen requiere intervención humana).
- BienCuidar es de El Salvador; publicaciones neutras para LatAm si se solicita.
- No usar markdown en el post final.
- No inventar estadísticas — solo datos de fuentes autorizadas.
- `scripts/` es local y gitignored.
