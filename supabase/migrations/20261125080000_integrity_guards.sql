-- Server-side enforcement of rules that only lived in the browser (client roles only; service_role/RPCs/admin bypass).
--  * max 2 open care requests per family (was only checked in useMarketplace.createCareRequest)
--  * care_requests: user_id and response_deadline immutable; status can only stay or become 'closed' ('matched' only via accept_offer)
--  * bookings: completed/cancelled are terminal
-- Rollback: DROP TRIGGER trg_limit_open_requests / trg_guard_care_requests ON public.care_requests; restore guard_bookings from
-- 20261125030000_guard_bookings_payment.sql.
CREATE OR REPLACE FUNCTION public.limit_open_care_requests()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF NEW.status = 'open' AND (SELECT count(*) FROM public.care_requests WHERE user_id = NEW.user_id AND status = 'open') >= 2 THEN
    RAISE EXCEPTION 'max_active_requests' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_limit_open_requests ON public.care_requests;
CREATE TRIGGER trg_limit_open_requests BEFORE INSERT ON public.care_requests
  FOR EACH ROW EXECUTE FUNCTION public.limit_open_care_requests();

CREATE OR REPLACE FUNCTION public.guard_care_requests()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  NEW.user_id := OLD.user_id;
  NEW.response_deadline := OLD.response_deadline;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed' THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_care_requests ON public.care_requests;
CREATE TRIGGER trg_guard_care_requests BEFORE UPDATE ON public.care_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_care_requests();

CREATE OR REPLACE FUNCTION public.guard_bookings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  NEW.user_id := OLD.user_id;
  NEW.nurse_id := OLD.nurse_id;
  NEW.total_price := OLD.total_price;
  NEW.request_id := OLD.request_id;
  NEW.offer_id := OLD.offer_id;
  NEW.wants_invoice := OLD.wants_invoice;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.wants_invoice OR NOT EXISTS (SELECT 1 FROM public.nurses n WHERE n.id = OLD.nurse_id AND n.user_id = auth.uid()) THEN
      NEW.payment_status := OLD.payment_status;
    END IF;
  END IF;
  IF OLD.status::text = 'pending_payment' AND NEW.status::text NOT IN ('pending_payment', 'cancelled') THEN
    NEW.status := OLD.status;
  END IF;
  IF OLD.status::text IN ('completed', 'cancelled') THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END $$;
