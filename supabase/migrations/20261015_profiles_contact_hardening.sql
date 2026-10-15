-- ============================================================
-- Profiles contact hardening
--
-- 1) booking_status: add missing 'pending_payment' — accept_offer
--    inserts it for the invoice path but the enum lacked the value,
--    so offer acceptance with wants_invoice failed on INSERT.
-- 2) is_admin() — SECURITY DEFINER helper (queries profiles without
--    triggering RLS recursion inside policies).
-- 3) has_service_contact(uuid) — phone/contact gate: true only when
--    the caller is the profile owner, an admin, or shares an active
--    booking (confirmed/completed) with that profile.
-- 4) demo_profile_ids() — SECURITY DEFINER source for the client-side
--    demo filter; profiles SELECT no longer returns other users' rows.
-- 5) profiles_public — phone exposed only when has_service_contact.
-- 6) profiles SELECT policy — own row or admin (was: any authenticated
--    could read email+phone of every user).
-- ============================================================

-- 1) enum fix for the invoice booking path
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_payment';

-- 2) admin check without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3) contact gate — active service relationship only
CREATE OR REPLACE FUNCTION public.has_service_contact(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM bookings b
      JOIN nurses n ON n.id = b.nurse_id
      WHERE b.status IN ('confirmed', 'completed')
        AND (
          (b.user_id = auth.uid() AND n.user_id = p_profile_id)
          OR (n.user_id = auth.uid() AND b.user_id = p_profile_id)
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_service_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_service_contact(uuid) TO authenticated;

-- 4) demo ids for client-side demo filtering (non-admin can't list profiles)
CREATE OR REPLACE FUNCTION public.demo_profile_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE is_demo;
$$;

REVOKE EXECUTE ON FUNCTION public.demo_profile_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_profile_ids() TO authenticated;

-- 5) profiles_public — phone gated by confirmed service relationship
DROP VIEW IF EXISTS profiles_public;

CREATE OR REPLACE VIEW profiles_public AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.location_name,
  p.role,
  p.country,
  -- Phone only when the caller shares an active booking with this
  -- profile (family ↔ nurse), or is the owner/admin. Catalog browsing
  -- gets NULL — direct contact unlocks after offer acceptance.
  CASE WHEN public.has_service_contact(p.id) THEN p.phone ELSE NULL END AS phone,
  p.created_at,
  p.updated_at
FROM profiles p
WHERE auth.uid() IS NOT NULL;

GRANT SELECT ON profiles_public TO authenticated;

-- 6) profiles SELECT — own row or admin only
DROP POLICY IF EXISTS "Authenticated can view profiles" ON profiles;

CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());
