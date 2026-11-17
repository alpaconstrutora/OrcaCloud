-- ==========================================================================
-- Tarefas de pagamento (`daily-payment-tasks`) — nunca criou uma tarefa
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 1)
-- Prova: scripts/teste-tarefas-pagamento.sql
-- Base:  20260602000001_tasks_payment_cron.sql
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "Corrigir os pontos citados" — ponto 3, a rotina
-- "Tarefas de pagamento" falha todo dia em que há conta vencendo.
--
-- O QUE MUDA (mesma assinatura e retorno → CREATE OR REPLACE)
-- 1. `p_priority := 1` é integer; `create_task` espera smallint e a escolha da função não
--    converte → 42883 em todo dia com conta no intervalo (0 tarefas `financeiro` em 16/11).
--    Agora `1::smallint`.
-- 2. Filtrava por `transaction_date` (lançamento). Agora pelo VENCIMENTO, com o mesmo filtro
--    do aviso irmão `fn_notif_pagamento_proximo` (20270919000002 — decisão do usuário em
--    03/09: tarefa E notificação para o mesmo fato): `due_date`, PENDING, fora de
--    PAGO/RECEBIDO/CANCELADO/RENEGOCIADO, organização preenchida.
-- 3. A idempotência era só `uq_tasks_source_open` (tarefa ABERTA): concluída, voltava no dia
--    seguinte, enquanto a conta estivesse na janela. Agora pula se a pessoa já teve tarefa
--    desta conta, em qualquer situação.
-- 4. Link `route: 'financial'` (tela inexistente) → `/contas-a-pagar?tx=<id>`, que abre a tela
--    no título — o mesmo do aviso. `source_ref.id` passa a ser o `id` do lançamento.
-- 5. Descrição "Vencimento em dd/mm/aaaa • R$ …" (`fn_brl`), como o aviso.
--
-- ROLLBACK
--   Rodar de novo a função de 20260602000001_tasks_payment_cron.sql (só o CREATE OR REPLACE).
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.generate_payment_tasks(p_days_ahead INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx      RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_id      UUID;
BEGIN
    FOR v_tx IN
        SELECT t.id, t.organization_id, t.amount, t.due_date,
               COALESCE(t.description, t.category, 'Conta a pagar') AS descricao
          FROM public.internal_transactions t
         WHERE t.direction = 'DEBIT'
           AND t.status    = 'PENDING'
           AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead
           AND COALESCE(t.business_status, 'PREVISTO')
               NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO', 'RENEGOCIADO')
           AND t.organization_id IS NOT NULL
    LOOP
        FOR v_member IN
            SELECT DISTINCT om.user_id
              FROM public.organization_members om
             WHERE om.organization_id = v_tx.organization_id
               AND om.user_id IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.tasks k
                    WHERE k.user_id               = om.user_id
                      AND k.source_module         = 'financeiro'
                      AND k.source_ref->>'type'   = 'internal_transaction'
                      AND k.source_ref->>'id'     = v_tx.id::text)
        LOOP
            v_id := public.create_task(
                p_user_id       := v_member.user_id,
                p_org_id        := v_tx.organization_id,
                p_title         := 'Pagar: ' || v_tx.descricao,
                p_due           := (v_tx.due_date || 'T12:00:00Z')::TIMESTAMPTZ,
                p_source_module := 'financeiro',
                p_source_ref    := jsonb_build_object(
                                       'type',  'internal_transaction',
                                       'id',    v_tx.id,
                                       'route', '/contas-a-pagar?tx=' || v_tx.id
                                   ),
                p_priority      := 1::SMALLINT,
                p_description   := 'Vencimento em ' || to_char(v_tx.due_date, 'DD/MM/YYYY')
                                   || ' • ' || public.fn_brl(v_tx.amount)
            );
            IF v_id IS NOT NULL THEN
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.generate_payment_tasks IS
    'Tarefa "Pagar: …" para cada membro da organização, para conta a pagar que VENCE em até N '
    'dias (mesmo filtro de fn_notif_pagamento_proximo). Uma por pessoa e conta: concluída não '
    'volta. Job daily-payment-tasks.';

-- 6. Só o job (postgres) roda. `authenticated` tinha EXECUTE: qualquer usuário logado podia
--    disparar a geração para TODAS as organizações. Ninguém no app nem nas Edge Functions
--    chama esta função (conferido em 16/11).
REVOKE ALL ON FUNCTION public.generate_payment_tasks(INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;
