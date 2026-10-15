-- Captura automática de boletos por e-mail — agendamento
--
-- Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 2.3).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar DEPOIS de publicar a Edge Function email-capture-sync.
--
-- A cada 15 minutos, e SÓ quando existe caixa ativa: sem conta conectada o
-- job não faz chamada HTTP nenhuma (a Edge Function nem acorda).
-- Mesmo padrão do `reconciliation-engine-sweep`: pg_net + o segredo dedicado
-- do Vault (`fn_cron_secret`), nunca a service_role key.

SELECT cron.unschedule('email-capture-sync')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-capture-sync');

SELECT cron.schedule(
    'email-capture-sync',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/email-capture-sync',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := jsonb_build_object('modo', 'agendado'),
        timeout_milliseconds := 150000
    )
     WHERE EXISTS (SELECT 1 FROM public.email_capture_accounts WHERE status = 'ativa');
    $cron$
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-capture-sync') THEN
        RAISE EXCEPTION 'job email-capture-sync não foi agendado';
    END IF;
    RAISE NOTICE 'OK: email-capture-sync agendado a cada 15 min (só com caixa ativa).';
END $$;
