-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule marketplace-cron to run every 15 minutes
-- Calls the edge function via the Supabase edge function endpoint
-- x-cron-secret header must match CRON_SECRET env var in Edge Functions
SELECT cron.schedule(
  'marketplace-cron-every-15-min',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://zqgtkrqfyhcvgagjhbnv.supabase.co/functions/v1/marketplace-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'x-cron-secret', 'd9bf0d34d6279e41ee3bfc4d05cca41c864f7a8a40d14ad23b9070854746300f'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
