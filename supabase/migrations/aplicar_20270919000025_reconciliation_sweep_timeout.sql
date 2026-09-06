-- ============================================================================
-- Varredura da conciliação: o banco precisa ESPERAR a resposta — item 3.3
-- docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md
--
-- ── O que se descobriu ao medir ────────────────────────────────────────────
-- `net.http_post` tem `timeout_milliseconds DEFAULT 5000`. Enquanto a Edge
-- Function fazia só a metade determinística, ela respondia em 2,8 s e cabia.
-- Com a pontuação incluída, a mesma conta levou **5,7 s** — e o pg_net desistiu:
-- a linha em `net._http_response` ficou com `status_code` NULL.
--
-- ⚠️ O trabalho NÃO se perde: a function continua rodando do outro lado e a
-- execução terminou `DONE` com 578 sugestões gravadas. O que se perde é a
-- CAPACIDADE DE SABER — do lado do banco, sucesso e falha ficam idênticos, os
-- dois como NULL. E "não dá para distinguir sucesso de falha" é exatamente a
-- doença que esta frente inteira está curando.
--
-- 120 segundos, com folga sobre os 5,7 s medidos na maior conta (5.735
-- lançamentos): a varredura roda de 10 em 10 minutos e não tem pressa nenhuma.
-- ============================================================================

SELECT cron.unschedule('reconciliation-engine-sweep')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconciliation-engine-sweep');

SELECT cron.schedule(
    'reconciliation-engine-sweep',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/reconciliation-engine',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || public.fn_cron_secret()
        ),
        body    := jsonb_build_object('bank_account_id', c.bank_account_id, 'trigger', 'CRON'),
        timeout_milliseconds := 120000
    )
      FROM public.fn_reconciliation_accounts_needing_run() c;
    $cron$
);

DO $$
DECLARE
    v_cmd text;
BEGIN
    SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'reconciliation-engine-sweep';
    IF v_cmd IS NULL OR position('timeout_milliseconds' in v_cmd) = 0 THEN
        RAISE EXCEPTION 'cron reconciliation-engine-sweep nao ficou com timeout explicito';
    END IF;
    RAISE NOTICE 'cron reconciliation-engine-sweep reagendado com timeout de 120 s';
END $$;
