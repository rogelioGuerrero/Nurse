-- profiles_public / care_requests_public / nurses_public are SECURITY DEFINER views (owner postgres) on purpose:
-- they mask PHI/contact data. But anon/authenticated also held INSERT/UPDATE/DELETE/TRUNCATE on them, and
-- profiles_public is auto-updatable, so an authenticated user could write to profiles through the view bypassing RLS
-- (verified: UPDATE via view affected 1 row). Views must be read-only for client roles.
-- Rollback: GRANT INSERT, UPDATE, DELETE ON public.profiles_public TO authenticated; (not recommended)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles_public, public.care_requests_public, public.nurses_public
  FROM anon, authenticated;
