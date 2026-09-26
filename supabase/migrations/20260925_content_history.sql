-- content_history: tracking del pipeline de contenido de Facebook
-- Usada por groq-news.mjs (INSERT), editorial-scout.mjs (SELECT),
-- fb-post.mjs (PATCH status='published'). Acceso via anon key (PostgREST
-- public schema), por eso va en `public` y no en schema dedicado.

create table if not exists public.content_history (
  id              bigint generated always as identity primary key,
  topic           text not null,
  article_text    text,
  teaser          text,
  next_topic      text,
  status          text not null default 'generated',   -- generated | published
  series_position int,
  fb_post_id      text,
  image_path      text,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- RLS: habilitada; la pipeline usa la anon key, así que necesita
-- select/insert/update sobre esta tabla (contenido de marketing, no PHI).
alter table public.content_history enable row level security;

drop policy if exists content_history_anon_select on public.content_history;
create policy content_history_anon_select
  on public.content_history for select
  to anon using (true);

drop policy if exists content_history_anon_insert on public.content_history;
create policy content_history_anon_insert
  on public.content_history for insert
  to anon with check (true);

drop policy if exists content_history_anon_update on public.content_history;
create policy content_history_anon_update
  on public.content_history for update
  to anon using (true) with check (true);
