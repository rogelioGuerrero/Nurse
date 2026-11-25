-- Diagnostics (read-only). Run via Supabase SQL / MCP execute_sql. None of these send anything.

-- 1) Last cron runs and their HTTP result (match by request time; net._http_response keeps recent rows)
select j.jobid, j.jobname, r.status, r.start_time
from cron.job j join lateral (select * from cron.job_run_details d where d.jobid=j.jobid order by start_time desc limit 3) r on true
order by j.jobid, r.start_time desc;

select id, status_code, left(content,160) body, created from net._http_response order by id desc limit 20;

-- 2) Cron commands must not contain literal secrets
select jobid, command ~ 'vault.decrypted_secrets' uses_vault, command ~ 'eyJ' has_jwt_literal from cron.job order by jobid;

-- 3) Guard triggers and policies present
select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_guard_%';
select policyname from pg_policies where tablename='nurses';

-- 4) Open incidents recorded by monitor-agent
select created_at, severity, source, left(message,160) from monitor_incidents order by created_at desc limit 20;

-- Edge function 401/403/500 by function (Supabase logs, ClickHouse via query_logs):
-- select log_attributes['request.path'] path, log_attributes['response.status_code'] status, count(*) n, max(timestamp) last_at
-- from logs where source='function_edge_logs' and timestamp > now() - interval 2 hour group by path, status order by n desc

-- Browser errors captured by log_client_error (admin only via RLS; run as admin or service role). Most frequent first:
select left(message,120) msg, path, source, count(*) n, max(created_at) last_at from client_errors where created_at > now() - interval '7 days' group by 1,2,3 order by n desc limit 20;
