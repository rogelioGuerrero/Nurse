-- Correcciones post-revision:
-- 1. care_requests_public debe exponer preferred_nurse_id (el badge "Te eligieron"
--    en NurseInbox lo necesita desde la vista, no desde la tabla base).
-- 2. has_service_contact: incluir 'pending_payment' para que el contacto se libere
--    al aceptar oferta con factura (booking queda pending_payment hasta pagar).
-- 3. Indice en nurses(user_id) para el join bookings->nurses en has_service_contact.

DROP VIEW IF EXISTS public.care_requests_public;

CREATE OR REPLACE VIEW public.care_requests_public AS
SELECT
  cr.id, cr.user_id, cr.specialization_needed, cr.slots, cr.location_name,
  cr.status, cr.created_at, cr.response_deadline, cr.lat, cr.lng,
  cr.wants_invoice, cr.expected_duration, cr.urgency,
  cr.patient_age_range, cr.patient_gender, cr.patient_condition, cr.nurse_summary,
  cr.preferred_nurse_id,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.patient_name ELSE NULL END AS patient_name,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.patient_data ELSE NULL END AS patient_data,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.notes ELSE NULL END AS notes
FROM public.care_requests cr
LEFT JOIN public.profiles caller ON caller.id = auth.uid()
WHERE auth.uid() IS NOT NULL
  AND (
    cr.user_id = auth.uid()
    OR cr.status = 'open'
    OR caller.role = 'admin'
  );

GRANT SELECT ON public.care_requests_public TO authenticated;

CREATE OR REPLACE FUNCTION public.has_service_contact(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.nurses n ON n.id = b.nurse_id
      WHERE b.status IN ('confirmed', 'pending_payment', 'completed')
        AND (
          (b.user_id = auth.uid() AND n.user_id = p_profile_id)
          OR (n.user_id = auth.uid() AND b.user_id = p_profile_id)
        )
    );
$$;

CREATE INDEX IF NOT EXISTS idx_nurses_user_id ON public.nurses(user_id);
