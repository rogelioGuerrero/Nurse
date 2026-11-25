CREATE OR REPLACE FUNCTION public.guard_bookings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  NEW.user_id := OLD.user_id;
  NEW.nurse_id := OLD.nurse_id;
  NEW.total_price := OLD.total_price;
  NEW.request_id := OLD.request_id;
  NEW.offer_id := OLD.offer_id;
  RETURN NEW;
END $$;
