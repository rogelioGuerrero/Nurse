-- AI response cache table
-- Stores hashed prompts and their LLM responses to avoid redundant Groq calls
CREATE TABLE IF NOT EXISTS public.ai_cache (
  id BIGSERIAL PRIMARY KEY,
  prompt_hash TEXT UNIQUE NOT NULL,
  model TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON public.ai_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON public.ai_cache(expires_at);

COMMENT ON TABLE public.ai_cache IS 'Cache de respuestas LLM para evitar llamadas redundantes a Groq';
