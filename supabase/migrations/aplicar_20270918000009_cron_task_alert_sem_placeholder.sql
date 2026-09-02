-- ============================================================
-- Migration: aplicar_20270918000009_cron_task_alert_sem_placeholder.sql
-- SEGURANÇA/OPERAÇÃO — achado C4-02 da auditoria de 2026-09-01
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 4.4
--
-- O QUE A AUDITORIA PREVIU E O BANCO CONFIRMOU
-- O achado C4-02 apontou o padrão `COALESCE(variavel, 'PLACEHOLDER')` nas
-- migrations de cron e disse que o efeito seria "o job falha em silêncio —
-- ninguém é avisado de que parou". Ao aplicar esta fase, a inspeção do banco
-- confirmou o prognóstico, e pior do que o descrito:
--
--   task-alert-notifier — agendado a cada minuto desde 20261118000011, com a URL
--   literal `https://SEU_PROJECT_REF.supabase.co`, que nunca foi substituída.
--   `net._http_response` registra 90 tentativas em 90 minutos, TODAS com
--   status_code NULL e error_msg "Couldn't resolve host name".
--   Ou seja: este job NUNCA funcionou. Nenhum alerta de prazo de tarefa jamais
--   saiu. E `cron.job_run_details` marca tudo como `succeeded`, porque pg_net é
--   assíncrono e o cron só enfileira — o erro real só aparece em
--   `net._http_response`, que ninguém olhava.
--
-- CORREÇÃO
-- Reagenda o job no mesmo formato do `daily-billing-ruler`, que é o único que já
-- estava certo: URL concreta e token lido de `vault.decrypted_secrets`. Sem
-- `coalesce` com literal — se o segredo não estiver no Vault, a chamada falha de
-- forma visível, que é o comportamento desejado.
--
-- ⚠️ PENDÊNCIA QUE ESTA MIGRATION NÃO RESOLVE
-- O segredo `billing_cron_token` do Vault está DESATUALIZADO: o
-- `daily-billing-ruler`, que já o usa, responde 401. Enquanto ele não for
-- atualizado com a service_role key vigente (Dashboard → Settings → API), este
-- job passará de "Couldn't resolve host name" para 401 — falha visível, mas
-- ainda falha. Atualizar o segredo é ação manual do dono do projeto; a chave não
-- passa por aqui.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-alert-notifier') THEN
        PERFORM cron.unschedule('task-alert-notifier');
    END IF;
END $$;

SELECT cron.schedule(
    'task-alert-notifier',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/task-alert-notifier',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                  FROM vault.decrypted_secrets
                 WHERE name = 'billing_cron_token'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_com_placeholder text;
    v_usa_vault boolean;
BEGIN
    -- Nenhum job pode conter literal de segredo ou de project ref não resolvido.
    SELECT string_agg(jobname, ', ') INTO v_com_placeholder
      FROM cron.job
     WHERE command LIKE '%CONFIGURE_SERVICE_ROLE_KEY%'
        OR command LIKE '%INTERNAL_SECRET_HERE%'
        OR command LIKE '%SUA_SERVICE_ROLE_KEY%'
        OR command LIKE '%SEU_PROJECT_REF%';

    IF v_com_placeholder IS NOT NULL THEN
        RAISE EXCEPTION 'C4-02: jobs ainda com placeholder: %', v_com_placeholder;
    END IF;

    SELECT command LIKE '%vault.decrypted_secrets%' INTO v_usa_vault
      FROM cron.job WHERE jobname = 'task-alert-notifier';

    IF NOT coalesce(v_usa_vault, false) THEN
        RAISE EXCEPTION 'C4-02: task-alert-notifier nao esta lendo o segredo do Vault';
    END IF;

    RAISE NOTICE 'C4-02 OK: nenhum job de cron com placeholder; task-alert-notifier le do Vault.';
    RAISE NOTICE 'PENDENTE (manual): atualizar o segredo billing_cron_token no Vault — hoje devolve 401.';
END $$;
