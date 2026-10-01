-- ════════════════════════════════════════════════════════════════════════════
-- Motor de conciliação: uma execução por conta, e sugestões trocadas de uma vez.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- Plano: docs/planos/2026-10-01-conciliacao-motor-duplicado.md
--
-- O defeito (medido em 01/10/2026): o navegador chamava a Edge `reconciliation-engine` com corte
-- de 20 s; na Alpa ela leva 26–61 s. O navegador desistia, entendia "servidor fora" e rodava o
-- motor de novo, no navegador, com a Edge ainda rodando. Eram dois motores na mesma conta, que
-- estouravam o statement_timeout de 8 s e deixavam execuções presas em RUNNING. E os dois apagam
-- TODAS as sugestões da conta antes de regravar: se cair no meio, a conta fica sem sugestão.
-- ════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

-- 1) Execução presa vira "interrompida". Edge tem teto de minutos; 10 min sem fechar = morta.
UPDATE public.reconciliation_runs
   SET status = 'FAILED',
       error_code = 'INTERRUPTED',
       error_message = 'Interrompida: ficou sem resposta por mais de 10 minutos (execução concorrente ou função derrubada).',
       finished_at = now()
 WHERE status = 'RUNNING'
   AND started_at < now() - interval '10 minutes';

-- 2) A TRAVA: no máximo uma execução RUNNING por conta. Vale para a Edge e para o navegador —
--    quem chegar depois recebe 23505 ao registrar e não roda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_runs_uma_rodando_por_conta
    ON public.reconciliation_runs (bank_account_id)
    WHERE status = 'RUNNING';

-- 3) É por esta coluna que o motor apaga e a tela lê.
CREATE INDEX IF NOT EXISTS idx_reconciliation_suggestions_bank_transaction
    ON public.reconciliation_suggestions (bank_transaction_id);

-- 4) Troca das sugestões numa transação só: ou fica a lista nova inteira, ou a antiga.
CREATE OR REPLACE FUNCTION public.fn_replace_suggestions(p_bank_ids uuid[], p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_inseridas integer;
BEGIN
    -- Não deixa a chamada gravar sugestão de extrato que ela não declarou que ia substituir.
    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS r(bank_transaction_id uuid)
         WHERE r.bank_transaction_id IS NULL OR NOT (r.bank_transaction_id = ANY(p_bank_ids))
    ) THEN
        RAISE EXCEPTION 'Sugestão para extrato fora da lista informada.' USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM public.reconciliation_suggestions
     WHERE bank_transaction_id = ANY(p_bank_ids);

    INSERT INTO public.reconciliation_suggestions (bank_transaction_id, candidate_internal_transaction_id, confidence, reason)
    SELECT r.bank_transaction_id, r.candidate_internal_transaction_id, r.confidence, r.reason
      FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb))
           AS r(bank_transaction_id uuid, candidate_internal_transaction_id uuid, confidence numeric, reason text);
    GET DIAGNOSTICS v_inseridas = ROW_COUNT;
    RETURN v_inseridas;
END;
$fn$;

-- REGRA #7: sem PUBLIC/anon. authenticated = motor no navegador (RLS de membro vale, INVOKER);
-- service_role = Edge.
REVOKE EXECUTE ON FUNCTION public.fn_replace_suggestions(uuid[], jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_replace_suggestions(uuid[], jsonb) TO authenticated, service_role;
