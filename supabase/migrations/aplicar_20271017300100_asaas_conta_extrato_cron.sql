-- Integração Asaas — importação do extrato da conta Asaas (item 2.4)
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar DEPOIS de publicar a Edge Function asaas-conta.
--
-- De hora em hora (minuto 7, fora do pico dos jobs de :00 e :15), e SÓ quando
-- existe conta Asaas ativa com chave guardada: sem conta, nenhuma chamada HTTP.
-- Mesmo padrão dos outros jobs: pg_net + segredo dedicado do Vault
-- (`fn_cron_secret`), nunca a service_role key.
-- REGRA #7: nenhuma policy nem função criada.

SELECT cron.unschedule('asaas-conta-extrato')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-conta-extrato');

SELECT cron.schedule(
    'asaas-conta-extrato',
    '7 * * * *',
    $cron$
    SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/asaas-conta',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 150000
    )
     WHERE EXISTS (SELECT 1 FROM public.payment_account_gateway
                    WHERE ativo AND vault_secret_id IS NOT NULL);
    $cron$
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-conta-extrato') THEN
        RAISE EXCEPTION 'job asaas-conta-extrato não foi agendado';
    END IF;
    RAISE NOTICE 'OK: asaas-conta-extrato agendado de hora em hora (só com conta Asaas ativa).';
END $$;
