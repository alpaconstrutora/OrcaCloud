-- Coluna para marcar que o alerta foi enviado (evita reenvios)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS alert_sent_at TIMESTAMPTZ;
COMMENT ON COLUMN tasks.alert_sent_at IS 'Data/hora em que o alerta foi disparado. NULL = ainda não enviado.';

-- Extensões necessárias (podem já existir)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (idempotência)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-alert-notifier') THEN
    PERFORM cron.unschedule('task-alert-notifier');
  END IF;
END $$;

-- Agenda chamada à Edge Function a cada minuto
-- CONFIGURE: substitua 'SUA_SERVICE_ROLE_KEY' pela chave real caso o vault não esteja configurado
SELECT cron.schedule(
  'task-alert-notifier',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT coalesce(
        current_setting('app.supabase_url', true),
        'https://SEU_PROJECT_REF.supabase.co'
      ) || '/functions/v1/task-alert-notifier'),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('vault.service_role_key', true),
          current_setting('app.service_role_key', true),
          'CONFIGURE_SERVICE_ROLE_KEY'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
