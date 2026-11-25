-- Lightweight browser error log (no third party). Written ONLY through log_client_error() (rate limited per IP, truncated,
-- no payloads/PHI: the client sends message, stack, path without query/hash). Readable by admins only. Pruned after 30 days.
-- Rollback: DROP FUNCTION public.log_client_error(text,text,text,text,text); DROP TABLE public.client_errors; SELECT cron.unschedule('client-errors-prune');
CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  source text NOT NULL DEFAULT 'window',
  path text,
  message text NOT NULL,
  stack text,
  user_agent text,
  app_version text
);
CREATE INDEX IF NOT EXISTS client_errors_created_idx ON public.client_errors (created_at DESC);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
DROP POLICY IF EXISTS "Admins read client errors" ON public.client_errors;
CREATE POLICY "Admins read client errors" ON public.client_errors FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_client_error(p_source text, p_path text, p_message text, p_stack text, p_app_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_headers json;
BEGIN
  PERFORM public._rate_limit('client_error', 30, 600);
  BEGIN v_headers := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN v_headers := NULL; END;
  INSERT INTO public.client_errors (user_id, source, path, message, stack, user_agent, app_version)
  VALUES (auth.uid(), left(coalesce(p_source, 'window'), 30), left(split_part(coalesce(p_path, ''), '?', 1), 200),
          left(coalesce(p_message, '(no message)'), 500), left(p_stack, 2000), left(v_headers ->> 'user-agent', 200), left(p_app_version, 40));
END $$;
REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text) TO anon, authenticated;

SELECT cron.schedule('client-errors-prune', '23 3 * * *', $$DELETE FROM public.client_errors WHERE created_at < now() - interval '30 days'$$);
