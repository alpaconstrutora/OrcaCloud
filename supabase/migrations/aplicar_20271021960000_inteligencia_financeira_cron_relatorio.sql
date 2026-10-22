-- ═══════════════════════════════════════════════════════════════════════════
-- Inteligência Financeira — Fase 3.2: cron do relatório por e-mail
-- Plano: docs/planos/2026-10-21-inteligencia-financeira-numeros-reais.md
--
-- APLICAR À MÃO, e SÓ DEPOIS de publicar a Edge `financial-report-notifier`
-- nova (deploy com --no-verify-jwt, gate próprio por CRON_SECRET):
--     npx supabase db query --linked -f <este arquivo>      (NUNCA `db push`)
--
-- Até aqui não havia cron nenhum: a tela pedia ao usuário que criasse um à mão
-- no painel do Supabase. De hora em hora, no minuto 0 — a Edge envia os
-- agendamentos ativos cuja hora (em Brasília) é a atual e que ainda não saíram
-- no dia. Mesmo formato do `dunning-notifier-hourly`: o segredo vem de
-- public.fn_cron_secret(), nunca literal, e nunca a service_role key.
--
-- Reversão: SELECT cron.unschedule('financial-report-hourly');
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'financial-report-hourly') THEN
        PERFORM cron.unschedule('financial-report-hourly');
    END IF;
END $$;

SELECT cron.schedule(
    'financial-report-hourly',
    '0 * * * *',
    $cron$
    SELECT net.http_post(
        url := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/financial-report-notifier',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body := '{}'::jsonb
    );
    $cron$
);
