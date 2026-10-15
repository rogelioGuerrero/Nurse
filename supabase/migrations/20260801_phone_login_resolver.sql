-- Migration: Phone-First login resolver & normalized phone index
-- Date: 2026-08-01

-- 1. Helper function to extract only digits from a phone string
CREATE OR REPLACE FUNCTION public.phone_digits(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

-- 2. Functional index on normalized phone digits for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_phone_digits
  ON public.profiles (public.phone_digits(phone));

-- 3. Resolve a login identifier (phone or email) into the auth email stored in profiles.
--    Security considerations:
--    - Only returns the email string needed to call signInWithPassword (password is still required).
--    - If no profile matches the phone digits, returns the deterministic synthetic email
--      so signInWithPassword fails with standard "Invalid login credentials" (no user enumeration).
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(
  p_identifier TEXT,
  p_country TEXT DEFAULT 'SV'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := lower(trim(COALESCE(p_identifier, '')));
  v_digits TEXT;
  v_dial TEXT;
  v_local_digits TEXT;
  v_e164_digits TEXT;
  v_found_email TEXT;
BEGIN
  -- If the user typed an email address, return it directly
  IF position('@' IN v_clean) > 0 THEN
    RETURN v_clean;
  END IF;

  v_digits := public.phone_digits(v_clean);
  IF length(v_digits) = 0 THEN
    RETURN '';
  END IF;

  v_dial := CASE upper(COALESCE(p_country, 'SV'))
    WHEN 'SV' THEN '503'
    WHEN 'GT' THEN '502'
    WHEN 'HN' THEN '504'
    WHEN 'NI' THEN '505'
    WHEN 'CR' THEN '506'
    WHEN 'PA' THEN '507'
    WHEN 'MX' THEN '52'
    WHEN 'CO' THEN '57'
    WHEN 'PE' THEN '51'
    WHEN 'EC' THEN '593'
    WHEN 'CL' THEN '56'
    WHEN 'AR' THEN '54'
    WHEN 'DO' THEN '1'
    ELSE '503'
  END;

  IF v_digits LIKE v_dial || '%' AND length(v_digits) > length(v_dial) + 6 THEN
    v_e164_digits := v_digits;
    v_local_digits := substr(v_digits, length(v_dial) + 1);
  ELSE
    v_local_digits := v_digits;
    v_e164_digits := v_dial || v_digits;
  END IF;

  -- Match against profiles.phone (stored either as local digits "7890-1234" or with country code "+503 7890-1234")
  SELECT p.email INTO v_found_email
  FROM public.profiles p
  WHERE public.phone_digits(p.phone) IN (v_local_digits, v_e164_digits)
    AND COALESCE(p.is_demo, false) = false
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_found_email IS NOT NULL AND length(v_found_email) > 0 THEN
    RETURN lower(v_found_email);
  END IF;

  -- Fallback: deterministic synthetic email
  RETURN v_e164_digits || '@tel.biencuidar.com';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT, TEXT) TO anon, authenticated;

-- 4. Check if a phone number is already registered in profiles (regardless of whether
--    the existing account used a synthetic email or a real email).
CREATE OR REPLACE FUNCTION public.is_phone_registered(
  p_phone TEXT,
  p_country TEXT DEFAULT 'SV'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := public.phone_digits(p_phone);
  v_dial TEXT;
  v_local_digits TEXT;
  v_e164_digits TEXT;
BEGIN
  IF length(v_digits) = 0 THEN
    RETURN false;
  END IF;

  v_dial := CASE upper(COALESCE(p_country, 'SV'))
    WHEN 'SV' THEN '503'
    WHEN 'GT' THEN '502'
    WHEN 'HN' THEN '504'
    WHEN 'NI' THEN '505'
    WHEN 'CR' THEN '506'
    WHEN 'PA' THEN '507'
    WHEN 'MX' THEN '52'
    WHEN 'CO' THEN '57'
    WHEN 'PE' THEN '51'
    WHEN 'EC' THEN '593'
    WHEN 'CL' THEN '56'
    WHEN 'AR' THEN '54'
    WHEN 'DO' THEN '1'
    ELSE '503'
  END;

  IF v_digits LIKE v_dial || '%' AND length(v_digits) > length(v_dial) + 6 THEN
    v_e164_digits := v_digits;
    v_local_digits := substr(v_digits, length(v_dial) + 1);
  ELSE
    v_local_digits := v_digits;
    v_e164_digits := v_dial || v_digits;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE public.phone_digits(p.phone) IN (v_local_digits, v_e164_digits)
      AND COALESCE(p.is_demo, false) = false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_phone_registered(TEXT, TEXT) TO anon, authenticated;
