---
description: Generar contenido de Facebook para BienCuidar usando el pipeline MoA de 5 agentes
---

# Workflow: Generación de contenido de Facebook (MoA 5 agentes)

## Pre-requisitos
- `GROQ_API_KEY` seteada en el entorno
- Node.js instalado
- Proyecto en `d:\proyectoBolt\LocalNourse`

## Paso 1: Definir tema y ángulo editorial
- Elegir tema de la lista de series de contenido (ver memoria)
- Escribir ángulo narrativo en `scripts/editorial-angle.txt` (historia humana, gancho emocional)
- El ángulo debe visibilizar el problema sin sensacionalizarlo

## Paso 2: Generar artículo con MoA
```powershell
$env:GROQ_API_KEY="gsk_..."; node scripts/groq-news.mjs "tema" @scripts/editorial-angle.txt
```

El pipeline ejecuta 5 agentes con feedback loops (patrón state-graph):
1. **SEARCH** — Groq Compound busca en fuentes autorizadas (WHO, PAHO, NIH, etc.)
2. **WRITE** — Llama 3.3 70b redacta borrador con gancho narrativo
3. **REVIEW** — Llama 3.3 70b verifica datos + evalúa ángulo ético
   - Puede devolver BUSCAR_MAS → vuelve a SEARCH
   - Puede devolver REESCRIBIR → vuelve a WRITE
   - APROBADO → pasa a EDIT
4. **EDIT** — Llama 3.3 70b pulido editorial
5. **APPROVE** — Llama 3.3 70b QA final (formato, CTA, hashtags)
   - RECHAZADO → vuelve a EDIT con feedback

Cada nodo valida su output. Si un agente produce output inválido, el pipeline falla explícitamente.

Tiempo esperado: 55-100s según feedback loops.

## Paso 3: Revisar artículo generado
- Abrir `scripts/generated-article.txt`
- Verificar: 150-200 palabras, español, sin markdown, 2-3 emojis profesionales, CTA, 3 hashtags
- Si no aprueba, editar `scripts/editorial-angle.txt` y repetir paso 2

## Paso 4: Generar imagen
- Copiar prompt de `scripts/gemini-prompt.txt`
- Pegar en Gemini Nano Banana
- Guardar imagen localmente
- Pasar la ruta de la imagen al asistente

## Paso 5: Publicar en Facebook
```powershell
node scripts/fb-post.mjs "<ruta-imagen>" @scripts/generated-article.txt
```

## Notas
- Frecuencia: una vez al día
- No automatizar (la imagen requiere intervención humana)
- BienCuidar es de El Salvador
- No usar markdown en el post final
- No inventar estadísticas — solo datos de fuentes autorizadas
