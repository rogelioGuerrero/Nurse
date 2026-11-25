-- Payment integrity for bookings (client roles only; service_role, SECURITY DEFINER RPCs and admins bypass).
--  * wants_invoice is immutable (flipping it would evade the platform fee).
--  * payment_status can change only for direct-pay bookings (wants_invoice=false) and only by the booking's nurse
--    (check-out flow). Invoiced bookings are confirmed by admin only.
--  * a booking in 'pending_payment' can only stay or be cancelled by participants; confirming requires admin.
-- Rollback: re-run the previous guard_bookings() body (see 20261125000000_guard_sensitive_columns.sql).
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
  RETURN NEW;
END $$;
