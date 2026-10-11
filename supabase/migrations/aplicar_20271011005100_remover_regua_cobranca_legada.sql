-- Remove o agendamento da régua de cobrança LEGADA (11/10/2026)
--
-- Pedido do usuário: "Sidebar Automação > Central de Automação: avaliar, parece
-- que perdeu utilidade" → "desligar / apagar tudo".
--
-- O job `daily-billing-ruler` chamava a Edge Function `process-billing-ruler`,
-- que lia `projects.settings.financialInfo.installments` + `billingRules`.
-- Medido antes de remover: 0 projetos com regras, 0 com parcelas, 0 com URL de
-- webhook de cobrança — a função varria todos os projetos com service_role e
-- não fazia nada. Além disso rodava às 05:00 UTC (02:00 BRT) e só dispara quando
-- a hora casa com `billingTriggerHour` (padrão 9): nunca casaria.
--
-- A régua de cobrança que funciona é OUTRA: `dunning_rules`/`dunning_events` +
-- job `dunning-notifier-hourly` (Financeiro › Cobrança Auto.). NÃO tocar nela.
--
-- A tabela `automation_history` FICA: `webhookService` continua gravando nela os
-- envios de pedido/cotação/contrato ao Make.com.
--
-- Reversão (comando que estava no job 39, segredo via função, não literal):
--   SELECT cron.schedule('daily-billing-ruler', '0 5 * * *', $$SELECT net.http_post(
--       url := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/process-billing-ruler',
--       headers := jsonb_build_object('Content-Type','application/json',
--                  'Authorization','Bearer ' || public.fn_cron_secret()),
--       body := '{}'::jsonb);$$);
--   …e redeploy da function a partir do git anterior a este commit.
--
-- Nome: nasceu como `aplicar_20271011005000` e colidiu com
-- `aplicar_20271011005000_remover_medicao_inteligente` (outra frente, mesmo dia).
-- Renomeado para 005100 — o conteúdo JÁ FOI APLICADO com o nome antigo; não reaplicar
-- por causa do nome novo (é idempotente de qualquer forma).
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`. Idempotente.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-billing-ruler') THEN
        PERFORM cron.unschedule('daily-billing-ruler');
    END IF;
END $$;
