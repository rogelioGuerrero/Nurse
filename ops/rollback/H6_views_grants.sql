-- Only if reads of the views break (they should not: SELECT grants were untouched).
GRANT SELECT ON public.profiles_public, public.care_requests_public, public.nurses_public TO anon, authenticated;
-- Do NOT restore INSERT/UPDATE/DELETE: profiles_public was writable bypassing RLS.
