-- ai_cache holds cached LLM responses (may contain patient symptoms). Only edge functions (service role) should touch it.
-- Revoke direct table privileges from client roles (RLS already blocked reads, this is defense in depth),
-- and prune expired rows daily: all 17 rows in prod were already expired, i.e. dead weight with potential PHI.
-- Rollback: GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_cache TO anon, authenticated; SELECT cron.unschedule('ai-cache-prune');
REVOKE ALL ON public.ai_cache FROM anon, authenticated;
SELECT cron.schedule('ai-cache-prune', '31 3 * * *', $$DELETE FROM public.ai_cache WHERE expires_at < now()$$);
