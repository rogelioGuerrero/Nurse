# Instrucciones de Configuración

## 1. Claves (NUNCA en el frontend)

La clave de Groq y cualquier otro secreto viven solo como secretos de Supabase (Edge Functions), jamas como variable `VITE_*` de Netlify: todo lo que empieza con `VITE_` queda publicado en el JavaScript del navegador.

```bash
supabase secrets set GROQ_API_KEY=<tu-clave>   # o Dashboard > Edge Functions > Secrets
```

El frontend solo necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (publicas por diseno).

## 2. Verificar Despliegue

1. Ir a https://localnurse.netlify.app
2. Verificar que el asistente clínico IA funcione
3. Verificar que el calendario de disponibilidad funcione en NurseDetail
4. Revisar console por errores

## Características Implementadas

### Asistente Clínico IA (Groq API)
- Asistente con GPT-OSS (OpenAI open-source) para familias y enfermeras
- Sugerencias rápidas y preguntas personalizadas
- Configurado vía Groq API

### Disponibilidad en Tiempo Real
- Tabla `availability` en Supabase
- CRUD completo (crear, leer, actualizar, eliminar)
- Calendario visual mensual
- Colores por estado:
  - Esmeralda: completamente disponible
  - Ambar: parcialmente disponible
  - Rosa: no disponible
- Integrado en NurseDetail
- Políticas RLS configuradas
