DROP TRIGGER IF EXISTS trg_guard_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trg_guard_nurses ON public.nurses;
DROP TRIGGER IF EXISTS trg_guard_bookings ON public.bookings;
DROP TRIGGER IF EXISTS trg_guard_care_offers ON public.care_offers;
-- handle_new_user: previous version trusted raw_user_meta_data->>'role' (unsafe); restore only if signup breaks.
