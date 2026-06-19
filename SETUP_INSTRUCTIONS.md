# Instrucciones de Configuración

## 1. Configurar API Key de Groq en Netlify

### Opción A: A través del Dashboard
1. Ir a https://app.netlify.com/
2. Seleccionar el proyecto `localnurse`
3. Ir a Site settings → Environment variables
4. Hacer clic en "Add a variable"
5. Key: `VITE_GROQ_API_KEY`
6. Value: (tu API key de Groq)
7. Hacer clic en "Save"
8. Trigger redeploy

### Opción B: A través de CLI (si está instalada)
```bash
netlify env:set VITE_GROQ_API_KEY (tu-api-key)
netlify deploy --prod
```

## 2. Verificar Despliegue

1. Ir a https://localnurse.netlify.app
2. Verificar que el asistente clínico IA funcione
3. Verificar que el calendario de disponibilidad funcione en NurseDetail
4. Revisar console por errores

## Características Implementadas

### Asistente Clínico IA (Groq API)
- Asistente con Llama-3 para familias y enfermeras
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
