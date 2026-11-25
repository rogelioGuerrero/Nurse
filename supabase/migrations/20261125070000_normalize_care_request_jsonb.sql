-- The web app inserts JSON.stringify(slots) / JSON.stringify(patient_data) into jsonb columns, which stores a jsonb STRING
-- (double-encoded) instead of an array/object. The frontend tolerates both when reading, but accept_offer() indexes slots
-- as an array and would return 'slot_not_found'. Normalize on write (covers old browser tabs and any client) and fix old rows.
-- Rollback: DROP TRIGGER trg_normalize_care_requests ON public.care_requests; DROP FUNCTION public.normalize_care_request_jsonb();
CREATE OR REPLACE FUNCTION public.normalize_care_request_jsonb()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.slots IS NOT NULL AND jsonb_typeof(NEW.slots) = 'string' THEN
      NEW.slots := (NEW.slots #>> '{}')::jsonb;
    END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    IF NEW.patient_data IS NOT NULL AND jsonb_typeof(NEW.patient_data) = 'string' THEN
      NEW.patient_data := (NEW.patient_data #>> '{}')::jsonb;
    END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_normalize_care_requests ON public.care_requests;
CREATE TRIGGER trg_normalize_care_requests BEFORE INSERT OR UPDATE ON public.care_requests
  FOR EACH ROW EXECUTE FUNCTION public.normalize_care_request_jsonb();

-- one-time fix of existing double-encoded rows (fires the trigger)
UPDATE public.care_requests SET slots = slots WHERE jsonb_typeof(slots) = 'string';
UPDATE public.care_requests SET patient_data = patient_data WHERE patient_data IS NOT NULL AND jsonb_typeof(patient_data) = 'string';
