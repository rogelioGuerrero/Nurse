-- accept_offer() assigned a TEXT variable to bookings.status (enum booking_status) -> 42804 at runtime.
-- Same body as 20261015013910_multislot_accept_offer_and_perf.sql with an explicit ::booking_status cast.
-- Rollback: re-apply the previous body (see that migration); note the previous body is broken in prod.
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer RECORD;
  v_request RECORD;
  v_slot JSONB;
  v_total_price NUMERIC;
  v_booking_id UUID;
  v_booking_status TEXT;
  -- Pricing constants — must match src/data/standardRates.ts (enforced by tests/pricing.test.ts)
  v_platform_commission NUMERIC := 5.00;
  v_iva_rate NUMERIC := 0.13;
BEGIN
  -- Lock the offer row to prevent concurrent acceptance
  SELECT * INTO v_offer
  FROM care_offers
  WHERE id = p_offer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'offer_not_found_or_not_pending');
  END IF;

  -- Lock the request
  SELECT * INTO v_request
  FROM care_requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'request_not_found');
  END IF;

  -- AUTH CHECK: only the request owner can accept offers
  IF auth.uid() IS NULL OR v_request.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'open' THEN
    RETURN jsonb_build_object('error', 'request_not_open', 'current_status', v_request.status);
  END IF;

  -- Extract the slot from the JSON array
  v_slot := v_request.slots::jsonb -> v_offer.slot_index;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'slot_not_found', 'slot_index', v_offer.slot_index);
  END IF;

  -- Calculate family price: commission + IVA when invoicing
  -- Must match calculateFamilyPrice() in src/data/standardRates.ts
  v_total_price := CASE WHEN v_request.wants_invoice
    THEN v_offer.offered_rate + v_platform_commission * (1 + v_iva_rate)
    ELSE v_offer.offered_rate END;

  v_booking_status := CASE WHEN v_request.wants_invoice
    THEN 'pending_payment'
    ELSE 'confirmed' END;

  -- Create booking with marketplace lineage (request_id / offer_id)
  INSERT INTO bookings (
    user_id, nurse_id, date, shift, total_price, notes,
    patient_name, patient_condition, wants_invoice,
    location_name, lat, lng, status,
    request_id, offer_id
  ) VALUES (
    v_request.user_id, v_offer.nurse_id,
    (v_slot ->> 'date')::date, v_slot ->> 'shift',
    v_total_price, v_request.notes,
    v_request.patient_name, v_request.patient_condition,
    v_request.wants_invoice,
    v_request.location_name, v_request.lat, v_request.lng,
    v_booking_status::booking_status,
    v_offer.request_id, v_offer.id
  ) RETURNING id INTO v_booking_id;

  -- Accept the offer
  UPDATE care_offers SET status = 'accepted' WHERE id = p_offer_id;

  -- Reject pending siblings for the SAME slot only (multi-turno support)
  UPDATE care_offers
  SET status = 'rejected', reject_reason = 'auto'
  WHERE request_id = v_offer.request_id
    AND slot_index = v_offer.slot_index
    AND id != p_offer_id
    AND status = 'pending';

  -- Mark request 'matched' ONLY when every slot index has an accepted offer
  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(0, jsonb_array_length(v_request.slots::jsonb) - 1) AS s(i)
    WHERE NOT EXISTS (
      SELECT 1
      FROM care_offers o
      WHERE o.request_id = v_offer.request_id
        AND o.slot_index = s.i
        AND o.status = 'accepted'
    )
  ) THEN
    UPDATE care_requests SET status = 'matched' WHERE id = v_offer.request_id;
  END IF;

  -- Auto-withdraw the nurse's pending offers on OTHER requests when the slot
  -- conflicts on date AND shift ('full_day' conflicts with any shift).
  WITH conflicting AS (
    SELECT o.id
    FROM care_offers o
    JOIN care_requests r ON r.id = o.request_id
    WHERE o.nurse_id = v_offer.nurse_id
      AND o.status = 'pending'
      AND o.id != p_offer_id
      AND r.slots::jsonb -> o.slot_index ->> 'date' = v_slot ->> 'date'
      AND (
        r.slots::jsonb -> o.slot_index ->> 'shift' = v_slot ->> 'shift'
        OR r.slots::jsonb -> o.slot_index ->> 'shift' = 'full_day'
        OR v_slot ->> 'shift' = 'full_day'
      )
  )
  UPDATE care_offers
  SET status = 'rejected', reject_reason = 'auto'
  WHERE id IN (SELECT id FROM conflicting);

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id
  );
END;
$function$;
