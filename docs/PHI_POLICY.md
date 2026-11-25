# Politica de datos de salud (PHI) — BienCuidar

Estado verificado el 2026-11-25 contra el codigo y la BD de produccion. Es un documento operativo, no asesoria legal: revisar con el asesor de AGTI, S.A. de C.V. antes de lanzar a familias reales.

## 1. Que datos sensibles existen y donde viven
| Dato | Tabla/columna | Quien lo lee |
|---|---|---|
| Nombre, edad, condicion y datos clinicos del paciente | `care_requests` (patient_name, patient_condition, patient_data, notes), `bookings` | La familia dueña; la enfermera con oferta/reserva; admin. Los demas usuarios ven la vista `care_requests_public` (enmascarada) |
| Contacto (email/telefono) | `profiles` | Solo el propio usuario y admin (RLS + vistas `*_public` sin esos campos) |
| Bitacora de visita, signos vitales | `care_logs` | Familia y enfermera de la reserva |
| Mensajes/recordatorios del modo paciente | `voice_reminders`, `benni_messages`, `health_log`, `patient_activity` | Familia dueña |
| Documento DUI y registro CSSP de la enfermera | `nurses` | La propia enfermera y admin |

Controles activos: RLS en todas las tablas, vistas enmascaradas, triggers que impiden alterar campos sensibles desde el cliente (`ops/OPS_LOG.md` H1, H8, H18), roles de cliente sin escritura sobre vistas (H6).

## 2. Que sale hacia terceros (verificar antes de ampliar)
- **Groq (LLM)**: `triage-request` envia nombre del paciente y la situacion descrita por la familia para generar el resumen para la enfermera; `ai-chat`/`ai-agent`/`benni-chat` envian mensajes del usuario. Groq es un tercero fuera de El Salvador.
- **Resend (correo)** y **Web Push**: avisos operativos (nombre del paciente y condicion aparecen en correos/push a enfermeras via `notify-marketplace`).
- **Facebook**: solo contenido de marketing local; no recibe datos de usuarios.
- **Logs de errores del navegador** (`client_errors`): solo mensaje, stack y ruta SIN query/hash; nunca payloads.

## 3. Reglas
1. Minimizar: no enviar al LLM identificadores directos que no hagan falta (apellidos, DUI, telefono). Sustituir el nombre por iniciales cuando el resultado no lo requiera. (Pendiente de aplicar en `triage-request`.)
2. Consentimiento: los terminos (`TermsAndConditions`) deben mencionar el uso de un proveedor de IA externo y el envio de datos del paciente a la enfermera elegida. (Pendiente de revisar con asesor.)
3. Retencion propuesta: `client_errors` 30 dias (automatico); `notification_logs` 90 dias; solicitudes cerradas/expiradas 12 meses y luego anonimizar patient_name/patient_data; cuentas eliminadas: borrar PHI asociada. (Pendiente de implementar los jobs de 90 dias/12 meses.)
4. Acceso: ningun script ni agente automatico puede leer PHI con service role fuera de las Edge Functions listadas en `supabase/functions/INVENTORY.md`.
5. Secretos nunca en el frontend (`VITE_*` es publico), ni en migraciones, ni en texto de cron (usar Vault).
6. Incidente con datos de salud: registrar en `ops/INCIDENTS.md`, evaluar notificacion a afectados y a la autoridad competente.
