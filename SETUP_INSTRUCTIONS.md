# Instrucciones de Configuración

## 1. Aplicar Migración SQL en Supabase

1. Ir a https://supabase.com/dashboard
2. Seleccionar el proyecto (zqgtkrqfyhcvgagjhbnv)
3. Ir a SQL Editor
4. Copiar el contenido de `src/lib/supabase-migrations/availability.sql`
5. Pegar en el SQL Editor
6. Hacer clic en "Run" para ejecutar la migración
7. Verificar que la tabla `availability` se creó correctamente

## 2. Configurar API Key de Groq en Netlify

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

## 3. Verificar Despliegue

1. Ir a https://localnurse.netlify.app
2. Verificar que Care Advice muestre consejos diarios
3. Verificar que el calendario de disponibilidad funcione en NurseDetail
4. Revisar console por errores

## Características Implementadas

### Care Advice (Groq API)
- Consejos diarios de cuidado de adultos mayores
- Categorizados: nutrición, seguridad, bienestar, medicación, social
- Caché de 24h para optimización
- Usa Llama 3.1 70B

### Disponibilidad en Tiempo Real
- Tabla `availability` en Supabase
- CRUD completo (crear, leer, actualizar, eliminar)
- Calendario visual mensual
- Colores por estado:
  - Verde: completamente disponible
  - Amarillo: parcialmente disponible
  - Rojo: no disponible
- Integrado en NurseDetail
- Políticas RLS configuradas
