-- ============================================================
-- Módulo: Qualidade & Entrega — Cron SLA Enforcement
-- OrçaCloud SaaS · Migration 20260514000002
-- Requer extensão pg_cron (já habilitada no projeto — ver 20260224000002)
-- ============================================================

-- Remover job anterior se existir (idempotente)
SELECT cron.unschedule('quality-sla-enforcement')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'quality-sla-enforcement'
);

-- Agendar: a cada 6 minutos
SELECT cron.schedule(
  'quality-sla-enforcement',
  '*/6 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_FUNCTIONS_URL') || '/quality-sla-enforcement',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
