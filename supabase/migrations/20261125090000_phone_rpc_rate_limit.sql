-- is_phone_registered / resolve_login_identifier must stay callable by anon (login/signup by phone), but allowed unlimited
-- enumeration of registered phones. Add a per-IP fixed-window limit (40 calls / 10 min per function) via thin wrappers; the
-- original bodies are kept untouched as _impl functions that clients can no longer execute.
-- Rollback: DROP wrappers, ALTER FUNCTION ..._impl RENAME back, GRANT EXECUTE to anon/authenticated.
CREATE TABLE IF NOT EXISTS public.rpc_rate_limit (
  key text NOT NULL,
  bucket timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, bucket)
);
ALTER TABLE public.rpc_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rpc_rate_limit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._rate_limit(p_scope text, p_max integer, p_window_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_key text;
  v_bucket timestamptz;
  v_n integer;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN v_headers := NULL;
  END;
  v_ip := trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', 'unknown'), ',', 1));
  v_key := p_scope || ':' || md5(v_ip);
  v_bucket := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rpc_rate_limit AS r (key, bucket, n) VALUES (v_key, v_bucket, 1)
  ON CONFLICT (key, bucket) DO UPDATE SET n = r.n + 1
  RETURNING r.n INTO v_n;
  IF v_n > p_max THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.resolve_login_identifier(text, text) RENAME TO _resolve_login_identifier_impl;
ALTER FUNCTION public.is_phone_registered(text, text) RENAME TO _is_phone_registered_impl;
REVOKE ALL ON FUNCTION public._resolve_login_identifier_impl(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._is_phone_registered_impl(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier text, p_country text DEFAULT 'SV'::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._rate_limit('resolve_login', 40, 600);
  RETURN public._resolve_login_identifier_impl(p_identifier, p_country);
END $$;

CREATE OR REPLACE FUNCTION public.is_phone_registered(p_phone text, p_country text DEFAULT 'SV'::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._rate_limit('phone_registered', 40, 600);
  RETURN public._is_phone_registered_impl(p_phone, p_country);
END $$;

REVOKE ALL ON FUNCTION public.resolve_login_identifier(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_phone_registered(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_phone_registered(text, text) TO anon, authenticated;

SELECT cron.schedule('rpc-rate-limit-prune', '17 3 * * *', $$DELETE FROM public.rpc_rate_limit WHERE bucket < now() - interval '1 day'$$);
