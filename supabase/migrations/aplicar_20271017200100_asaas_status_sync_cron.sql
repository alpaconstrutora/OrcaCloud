-- Integração Asaas — agendamento do polling de fallback (item 1.9)
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar DEPOIS de publicar a Edge Function asaas-status-sync.
--
-- A cada 15 minutos, e SÓ quando há algo em aberto na Asaas: sem cobrança
-- pendente nem pagamento em andamento o job não faz chamada HTTP nenhuma.
-- Mesmo padrão do `email-capture-sync`: pg_net + segredo dedicado do Vault
-- (`fn_cron_secret`), nunca a service_role key.
-- REGRA #7: nenhuma policy nem função criada.

SELECT cron.unschedule('asaas-status-sync')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-status-sync');

SELECT cron.schedule(
    'asaas-status-sync',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/asaas-status-sync',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 150000
    )
     WHERE EXISTS (SELECT 1 FROM public.client_charges
                    WHERE status IN ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS')
                      AND asaas_payment_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM public.supplier_payments
                    WHERE status IN ('PENDING', 'SCHEDULED'));
    $cron$
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-status-sync') THEN
        RAISE EXCEPTION 'job asaas-status-sync não foi agendado';
    END IF;
    RAISE NOTICE 'OK: asaas-status-sync agendado a cada 15 min (só com algo em aberto).';
END $$;
