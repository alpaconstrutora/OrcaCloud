-- Migration: Setup Scheduled Billing Ruler
-- Date: 2026-02-24
-- Description: Enables pg_cron and pg_net to schedule the process-billing-ruler Edge Function.

-- 1. Enable necessary extensions (Requires superuser usually, but Supabase handles this in the dashboard or via migrations)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Clear existing job if it exists to avoid duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-billing-ruler') THEN
        PERFORM cron.unschedule('daily-billing-ruler');
    END IF;
END $$;

-- 3. Schedule the Edge Function call
-- We use net.http_post to call the Edge Function.
-- The function runs every hour at minute 0.
-- Inside the function, it checks if the current hour matches the project's billingTriggerHour.
-- We pass the service role key or anon key if needed, though for internal calls service role is preferred.
-- PORT 54321 is the default for local edge functions, but in production, we'd use the project URL.
-- For a generic migration, we use the internal net.http_post to the project's own edge function endpoint.

SELECT cron.schedule(
  'daily-billing-ruler', -- Unique name for the job
  '0 * * * *',          -- Cron expression: Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := (SELECT value FROM (SELECT coalesce(
        (SELECT 'https://' || (SELECT substring(current_setting('request.header.host') from '^[a-z0-9]+')) || '.supabase.co/functions/v1/process-billing-ruler'),
        'http://localhost:54321/functions/v1/process-billing-ruler'
      )) AS t(value))),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT COALESCE(current_setting('vault.service_role_key', true), 'INTERNAL_SECRET_HERE'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- NOTE: The URL and Token logic above is illustrative. 
-- In a real Supabase environment, you would typically hardcode your project URL 
-- or use a custom setting if you have one.
-- To work correctly, you should replace 'INTERNAL_SECRET_HERE' with your service_role key 
-- if not using the Vault.
