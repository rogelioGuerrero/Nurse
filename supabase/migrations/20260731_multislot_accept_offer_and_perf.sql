-- Migration: multi-slot accept_offer + bookings lineage + view/index performance
-- Date: 2026-07-31
-- P0-5: accepting one offer must only cover its own slot_index, not close the
--       whole multi-slot request or reject offers for other dates.
--       bookings gains request_id/offer_id FKs for lineage (no more N+1 by name).
-- P0-2: profiles_public view for marketplace counterpart hydration.
-- P1-2: nurses_public / care_requests_public — evaluate caller role ONCE per
--       query instead of a correlated EXISTS subquery per row per column.

-- ============================================================
-- 1) bookings lineage columns
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.care_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.care_offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_request_id ON public.bookings(request_id);
CREATE INDEX IF NOT EXISTS idx_bookings_offer_id ON public.bookings(offer_id);

-- ============================================================
-- 2) accept_offer — multi-slot aware
--    * Rejects siblings only for the SAME slot_index.
--    * Marks the request 'matched' only when EVERY slot index is covered.
--    * Auto-withdraws the nurse's pending offers on OTHER requests only when
--      the slot conflicts on date AND shift (or either side is 'full_day').
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_request RECORD;
  v_slot JSONB;
  v_total_price NUMERIC;
  v_booking_id UUID;
  v_booking_status TEXT;
  -- Pricing constants — must match src/data/standardRates.ts
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
    v_booking_status,
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
$$;

REVOKE EXECUTE ON FUNCTION public.accept_offer(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_offer(UUID) TO authenticated;

-- ============================================================
-- 3) profiles_public — public counterpart fields for marketplace hydration
--    (family → nurse profiles, nurse → family profiles)
--    security_definer view: bypasses profiles RLS for these columns only.
--    No email, no sensitive data.
-- ============================================================

DROP VIEW IF EXISTS profiles_public;

CREATE OR REPLACE VIEW profiles_public AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.location_name,
  p.role,
  p.country,
  -- Phone is only exposed for nurses (marketplace providers); family/admin
  -- phone numbers remain private.
  CASE WHEN p.role = 'nurse' THEN p.phone ELSE NULL END AS phone,
  p.created_at,
  p.updated_at
FROM profiles p
WHERE auth.uid() IS NOT NULL;

GRANT SELECT ON profiles_public TO authenticated;

-- ============================================================
-- 4) Optimized public views — caller role evaluated ONCE via join
--    (was: correlated EXISTS subquery per row per CASE, 9x / 4x)
-- ============================================================

DROP VIEW IF EXISTS nurses_public;

CREATE OR REPLACE VIEW nurses_public AS
SELECT
  n.id, n.user_id, n.specialization, n.coverage_radius, n.rating, n.review_count,
  n.lat, n.lng, n.bio, n.experience_years, n.certifications, n.created_at, n.updated_at,
  n.shift_rate, n.available_shifts, n.available_days, n.cssp_level, n.cssp_verified,
  n.cssp_verification_status, n.cssp_verification_date, n.assignment_availability,
  n.payment_preference, n.is_active,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.dui ELSE NULL END AS dui,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.cssp_registration ELSE NULL END AS cssp_registration,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.cssp_verification_notes ELSE NULL END AS cssp_verification_notes,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.cssp_email_sent_at ELSE NULL END AS cssp_email_sent_at,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.cssp_email_count ELSE NULL END AS cssp_email_count,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.inactivity_email_count ELSE NULL END AS inactivity_email_count,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.inactivity_email_sent_at ELSE NULL END AS inactivity_email_sent_at,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.verifications ELSE NULL END AS verifications,
  CASE WHEN n.user_id = auth.uid() OR caller.role = 'admin'
    THEN n.portal_down_notified ELSE NULL END AS portal_down_notified
FROM nurses n
LEFT JOIN profiles caller ON caller.id = auth.uid()
WHERE auth.uid() IS NOT NULL;

GRANT SELECT ON nurses_public TO authenticated;

DROP VIEW IF EXISTS care_requests_public;

CREATE OR REPLACE VIEW care_requests_public AS
SELECT
  cr.id, cr.user_id, cr.specialization_needed, cr.slots, cr.location_name,
  cr.status, cr.created_at, cr.response_deadline, cr.lat, cr.lng,
  cr.wants_invoice, cr.expected_duration, cr.urgency,
  cr.patient_age_range, cr.patient_gender, cr.patient_condition, cr.nurse_summary,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.patient_name ELSE NULL END AS patient_name,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.patient_data ELSE NULL END AS patient_data,
  CASE WHEN cr.user_id = auth.uid() OR caller.role = 'admin'
    THEN cr.notes ELSE NULL END AS notes
FROM care_requests cr
LEFT JOIN profiles caller ON caller.id = auth.uid()
WHERE auth.uid() IS NOT NULL
  AND (
    cr.user_id = auth.uid()
    OR cr.status = 'open'
    OR caller.role = 'admin'
  );

GRANT SELECT ON care_requests_public TO authenticated;

-- ============================================================
-- 5) Performance indexes for frequent query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_user_id_date ON public.bookings(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_nurse_id_date ON public.bookings(nurse_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.bookings(status, created_at);
CREATE INDEX IF NOT EXISTS idx_care_requests_status_deadline ON public.care_requests(status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_care_requests_user_status ON public.care_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_care_offers_request_status ON public.care_offers(request_id, status);
CREATE INDEX IF NOT EXISTS idx_care_offers_nurse_status ON public.care_offers(nurse_id, status);
CREATE INDEX IF NOT EXISTS idx_care_logs_booking_id ON public.care_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_voice_reminders_active_time ON public.voice_reminders(active, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_benni_messages_family_status ON public.benni_messages(family_user_id, direction, status);
