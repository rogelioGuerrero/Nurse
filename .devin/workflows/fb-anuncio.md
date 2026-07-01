---
description: Generar y publicar un anuncio en Facebook de BienCuidar con texto + imagen
auto_execution_mode: 3
---

# Publicar anuncio en Facebook

## Paso 1: Generar texto del anuncio

Generar un texto para Facebook siguiendo estas reglas:
- Tono: cálido y cercano, dirigido a familias salvadoreñas
- Breve: máximo 3 párrafos, idealmente 2
- Incluir CTA suave: "Publicá tu necesidad gratis en https://biencuidar.agtisa.com"
- En español, tono profesional pero accesible
- Emojis profesionales, no excesivos (2-3 por post). Preferidos: 🩺 💙 🌐
- Máximo 3 hashtags
- No usar cacofonía ni repetir "enfermería" cerca de "enfermeras"
- Links con https:// para que sean clickeables en Facebook

Mostrar el texto al usuario y esperar aprobación o cambios.

## Paso 2: Definir imagen

Una vez aprobado el texto, preguntar al usuario:
- ¿Tiene una imagen en su disco duro? → pedir la ruta
- ¿Quiere un prompt para Gemini? → generar prompt detallado

### Generación de prompt para Gemini

El prompt debe:
- Ser en inglés (Gemini genera mejores imágenes con prompts en inglés)
- Describir la escena de forma detallada: sujetos, entorno, colores, estilo
- Incluir estilo fotográfico o ilustración según convenga
- Reflejar el contexto salvadoreño (rasgos, entorno, cultura)
- Evitar texto dentro de la imagen (Gemini no maneja bien texto)
- Proporción cuadrada o horizontal (ideal para Facebook)

Ejemplo de estructura:
```
A [subject] in [setting], [action/pose], [mood/atmosphere], 
[colors/lighting], [style: realistic photo / illustration], 
Salvadoran context, no text in image, high quality
```

Ejemplo aprobado (anuncio de conexión familia-enfermera):
```
A warm, professional scene of a Salvadoran family sitting with a female nurse in a cozy home living room. The nurse is wearing blue medical scrubs, gently checking on an elderly family member. The family looks relieved and grateful. Soft natural lighting through windows, warm color palette with blues and earthy tones. Realistic photography style, horizontal composition, Salvadoran cultural context, no text in image, high quality.
```

Mostrar el prompt al usuario para que lo copie y lo pegue en Gemini.
Una vez que el usuario tenga la imagen generada, pedir la ruta del archivo descargado.

## Paso 3: Publicar

Si el usuario proporciona una imagen local, ejecutar:

```
// turbo
node scripts/fb-post.mjs "<ruta-imagen>" "<mensaje con \n para saltos de línea>"
```

Notas:
- El script reemplaza \n literales por saltos de línea reales automáticamente
- La imagen se comprime automáticamente con sharp (resize 1200px + JPEG 80%)
- Se envía como base64 a la edge function fb-publish en Supabase
- NO se necesita Supabase Storage
- NO se necesitan credenciales de Facebook localmente
- Mostrar el Post ID al usuario como confirmación
