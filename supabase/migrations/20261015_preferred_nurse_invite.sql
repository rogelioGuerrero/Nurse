-- Pedir propuesta dirigida: la familia puede invitar a una enfermera específica
-- desde el directorio. El flujo marketplace no cambia: la enfermera invitada
-- debe enviar su oferta y la familia aceptarla.

ALTER TABLE public.care_requests
  ADD COLUMN IF NOT EXISTS preferred_nurse_id uuid REFERENCES public.nurses(id);

CREATE INDEX IF NOT EXISTS idx_care_requests_preferred_nurse
  ON public.care_requests(preferred_nurse_id)
  WHERE preferred_nurse_id IS NOT NULL;
