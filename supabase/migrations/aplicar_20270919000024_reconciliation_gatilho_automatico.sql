-- ============================================================================
-- Gatilho automático do motor de conciliação — item 3.3 do plano
-- docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md
--
-- ── O buraco que isto fecha ────────────────────────────────────────────────
-- Hoje a importação chama o motor pelo NAVEGADOR. Se a aba fecha no meio, se o
-- bundle está velho em cache, se a rede cai, ou se o motor levanta exceção, o
-- extrato entra e ninguém concilia — e nada avisa. Foi assim que, em 06/09/2026,
-- o motor ficou um dia inteiro sem rodar por um `22P02`: a tela dizia apenas
-- "Erro ao reprocessar", num aviso que nem chegava a ser desenhado.
--
-- A rede de segurança: de 10 em 10 minutos, procurar conta que RECEBEU
-- importação e NÃO teve execução bem-sucedida depois dela, e disparar a Edge
-- Function `reconciliation-engine` para essa conta. O caminho pelo navegador
-- continua existindo, porque ele dá o número na hora para quem importou; este
-- cron só cobre quando aquele caminho não completou.
--
-- ⚠️ Por que NÃO é trigger de INSERT em bank_statement_imports: o registro da
-- importação é gravado ANTES de o motor rodar, então um trigger dispararia em
-- paralelo com o motor do navegador — dois processos escrevendo o mesmo vínculo
-- ao mesmo tempo, com resultado que depende de quem chega primeiro. A janela de
-- 10 minutos garante que o caminho normal já terminou (ou já falhou).
-- ============================================================================

-- ── 1. Quais contas estão devendo execução ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconciliation_accounts_needing_run()
RETURNS TABLE (bank_account_id uuid, organization_id uuid, imported_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH ultima_importacao AS (
        SELECT i.bank_account_id,
               i.organization_id,
               max(i.created_at) AS imported_at
          FROM public.bank_statement_imports i
         GROUP BY i.bank_account_id, i.organization_id
    )
    SELECT u.bank_account_id, u.organization_id, u.imported_at
      FROM ultima_importacao u
     WHERE
        -- A importação já teve tempo de ser conciliada pelo caminho normal.
        u.imported_at < now() - interval '10 minutes'
        -- ...e ainda assim nenhuma execução COMPLETOU depois dela.
        AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_runs r
             WHERE r.bank_account_id = u.bank_account_id
               AND r.status = 'DONE'
               AND r.started_at >= u.imported_at
        )
        -- Nada rodando agora: execução travada em RUNNING há muito tempo não
        -- segura a fila para sempre, mas também não se atropela a que está viva.
        AND NOT EXISTS (
            SELECT 1 FROM public.reconciliation_runs r
             WHERE r.bank_account_id = u.bank_account_id
               AND r.status = 'RUNNING'
               AND r.started_at > now() - interval '15 minutes'
        )
        -- Teto de tentativas: se o motor falha por defeito, insistir de 10 em 10
        -- minutos para sempre só enche `reconciliation_runs` de FAILED iguais e
        -- esconde o sinal. Três tentativas e para — o registro fica lá para ser
        -- lido, que é o ponto.
        AND (
            SELECT count(*) FROM public.reconciliation_runs r
             WHERE r.bank_account_id = u.bank_account_id
               AND r.trigger = 'CRON'
               AND r.started_at >= u.imported_at
        ) < 3;
$$;

COMMENT ON FUNCTION public.fn_reconciliation_accounts_needing_run() IS
    'Contas com importação sem execução bem-sucedida depois dela. Fonte do cron reconciliation-engine-sweep.';

-- REGRA OBRIGATÓRIA #7: função nova nasce fechada.
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_accounts_needing_run() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_accounts_needing_run() TO authenticated;

-- ── 2. O cron ──────────────────────────────────────────────────────────────
-- Mesmo padrão do `fiscal-fallback-polling`: pg_net + o segredo dedicado do
-- vault, nunca a service_role key (ela ignora TODA a RLS e não precisa trafegar
-- em header a cada dez minutos). `fn_cron_secret()` levanta exceção se o segredo
-- faltar ou for curto — falha com nome no banco, em vez de 401 anônimo na ponta.
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
        body    := jsonb_build_object('bank_account_id', c.bank_account_id, 'trigger', 'CRON')
    )
      FROM public.fn_reconciliation_accounts_needing_run() c;
    $cron$
);

DO $$
DECLARE
    v_devendo int;
BEGIN
    SELECT count(*) INTO v_devendo FROM public.fn_reconciliation_accounts_needing_run();
    RAISE NOTICE 'cron reconciliation-engine-sweep agendado. Contas devendo execução agora: %', v_devendo;
END $$;
