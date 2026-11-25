-- Fix of 20261125080000_integrity_guards.sql: the client role has no direct SELECT on care_requests (column-level grants),
-- so counting inside the invoker trigger failed with 42501. Count through a SECURITY DEFINER helper bound to auth.uid().
-- (Applied to prod minutes after 080000; the trigger was broken only for that window.)
CREATE OR REPLACE FUNCTION public._my_open_request_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.care_requests WHERE user_id = auth.uid() AND status = 'open'
$$;
REVOKE ALL ON FUNCTION public._my_open_request_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._my_open_request_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.limit_open_care_requests()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF NEW.status = 'open' AND public._my_open_request_count() >= 2 THEN
    RAISE EXCEPTION 'max_active_requests' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
