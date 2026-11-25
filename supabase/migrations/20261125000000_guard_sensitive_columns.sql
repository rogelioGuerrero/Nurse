-- Guard sensitive columns against writes from client roles (authenticated/anon).
-- Rationale: RLS policies allow row-level UPDATE but the client roles hold UPDATE on every column,
-- so a logged-in user could self-promote (profiles.role), self-verify (nurses.cssp_verified),
-- edit prices/payment or force-accept offers. Trusted paths are unaffected:
--   * service_role / postgres / SECURITY DEFINER RPCs (accept_offer) -> current_user is not authenticated/anon
--   * admins (is_admin()) -> bypass
-- Disallowed changes are silently reverted (no exception) so legitimate upserts keep working.
-- Rollback: DROP TRIGGER trg_guard_* ON <table>; DROP FUNCTION public.guard_*();

CREATE OR REPLACE FUNCTION public._is_client_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT current_user IN ('authenticated', 'anon') AND NOT public.is_admin() $$;

CREATE OR REPLACE FUNCTION public.guard_profiles()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text NOT IN ('user', 'nurse') THEN NEW.role := 'user'; END IF;
    NEW.is_demo := false;
  ELSE
    NEW.role := OLD.role;
    NEW.is_demo := OLD.is_demo;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_nurses()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.cssp_verified := false;
    NEW.cssp_verification_date := NULL;
    NEW.cssp_verification_notes := NULL;
    IF NEW.cssp_verification_status IS NOT NULL AND NEW.cssp_verification_status NOT IN ('unverified', 'n/a', 'pending') THEN
      NEW.cssp_verification_status := 'unverified';
    END IF;
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.cssp_verified := OLD.cssp_verified;
    NEW.cssp_verification_status := OLD.cssp_verification_status;
    NEW.cssp_verification_date := OLD.cssp_verification_date;
    NEW.cssp_verification_notes := OLD.cssp_verification_notes;
    NEW.cssp_email_sent_at := OLD.cssp_email_sent_at;
    NEW.cssp_email_count := OLD.cssp_email_count;
    NEW.inactivity_email_count := OLD.inactivity_email_count;
    NEW.inactivity_email_sent_at := OLD.inactivity_email_sent_at;
    NEW.portal_down_notified := OLD.portal_down_notified;
    NEW.verifications := OLD.verifications;
    NEW.rating := OLD.rating;
    NEW.review_count := OLD.review_count;
  END IF;
  RETURN NEW;
END $$;

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

CREATE OR REPLACE FUNCTION public.guard_care_offers()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'accepted' THEN NEW.status := 'pending'; END IF;
  ELSE
    NEW.nurse_id := OLD.nurse_id;
    NEW.request_id := OLD.request_id;
    NEW.slot_index := OLD.slot_index;
    NEW.offered_rate := OLD.offered_rate;
    IF NEW.status::text = 'accepted' AND OLD.status::text <> 'accepted' THEN NEW.status := OLD.status; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profiles ON public.profiles;
CREATE TRIGGER trg_guard_profiles BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles();

DROP TRIGGER IF EXISTS trg_guard_nurses ON public.nurses;
CREATE TRIGGER trg_guard_nurses BEFORE INSERT OR UPDATE ON public.nurses
  FOR EACH ROW EXECUTE FUNCTION public.guard_nurses();

DROP TRIGGER IF EXISTS trg_guard_bookings ON public.bookings;
CREATE TRIGGER trg_guard_bookings BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_bookings();

DROP TRIGGER IF EXISTS trg_guard_care_offers ON public.care_offers;
CREATE TRIGGER trg_guard_care_offers BEFORE INSERT OR UPDATE ON public.care_offers
  FOR EACH ROW EXECUTE FUNCTION public.guard_care_offers();

-- Signup path: role comes from user-controlled raw_user_meta_data; never allow 'admin'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$ BEGIN INSERT INTO public.profiles (id, email, full_name, role, phone, location_name, avatar_url) VALUES ( new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'), (CASE WHEN new.raw_user_meta_data->>'role' = 'nurse' THEN 'nurse' ELSE 'user' END)::user_role, COALESCE(new.raw_user_meta_data->>'phone', NULL), COALESCE(new.raw_user_meta_data->>'location_name', NULL), COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100') ) ON CONFLICT (id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, profiles.phone), full_name = COALESCE(EXCLUDED.full_name, profiles.full_name), role = EXCLUDED.role, location_name = COALESCE(EXCLUDED.location_name, profiles.location_name); RETURN NEW; END; $function$;
