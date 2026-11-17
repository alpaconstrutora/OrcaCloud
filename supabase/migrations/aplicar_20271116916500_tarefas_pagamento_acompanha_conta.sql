-- ==========================================================================
-- Tarefas de pagamento — a tarefa acompanha a conta; membro órfão não derruba a rotina
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (revisão da Tarefa 1)
-- Prova: scripts/teste-tarefas-pagamento.sql
-- Base:  aplicar_20271116916400_tarefas_pagamento_corrige.sql (já aplicada)
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "Corrigir os pontos citados" — achados da revisão
-- independente da correção da rotina "Tarefas de pagamento", resolvidos no mesmo pedido.
--
-- O QUE MUDA (mesma assinatura e retorno → CREATE OR REPLACE)
-- 1. Conta paga, conciliada, cancelada, renegociada ou apagada: as tarefas ABERTAS dela fecham
--    (status 'done'; quem tem status customizado vai para o "concluído" da organização). Antes
--    ficavam abertas e, depois do vencimento, em "Atrasadas" para sempre.
--    Conta que só passou do vencimento SEM ser paga não fecha: ainda há o que pagar.
-- 2. Conta adiada: as tarefas abertas passam a vencer na data nova (data, descrição e
--    `source_ref.due`).
-- 3. O vencimento entra na chave (`source_ref.due`): concluída para um vencimento, não volta;
--    a conta adiada para outro vencimento dentro da janela gera tarefa nova.
-- 4. Membro com `user_id` fora de `auth.users` (organization_members não tem FK; tasks tem) é
--    pulado. Antes, um só derrubava a rotina inteira com 23503, todo dia.
--
-- Decisão registrada: tarefa EXCLUÍDA pela pessoa volta na execução seguinte enquanto a conta
-- estiver na janela (não há registro de "já gerada"). Concluir é o jeito de dispensar.
--
-- Privilégio: segue só postgres (o job) e service_role — sem PUBLIC, anon nem authenticated.
--
-- ROLLBACK
--   Rodar de novo a função de aplicar_20271116916400_tarefas_pagamento_corrige.sql.
--   (Tarefas fechadas por esta versão não reabrem sozinhas.)
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
    -- 1. Fecha as abertas cuja conta não está mais a pagar.
    UPDATE public.tasks k
       SET status    = 'done',
           status_id = CASE WHEN k.status_id IS NULL THEN NULL
                            ELSE coalesce((SELECT s.id FROM public.task_statuses s
                                            WHERE s.org_id = k.org_id AND s.is_done
                                            ORDER BY s.position LIMIT 1), k.status_id) END
     WHERE k.status       <> 'done'
       AND k.source_module = 'financeiro'
       AND k.source_ref->>'type' = 'internal_transaction'
       AND NOT EXISTS (
           SELECT 1 FROM public.internal_transactions t
            WHERE t.id::text  = k.source_ref->>'id'
              AND t.direction = 'DEBIT'
              AND t.status    = 'PENDING'
              AND COALESCE(t.business_status, 'PREVISTO')
                  NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO', 'RENEGOCIADO'));

    -- 2. Acompanha o vencimento das abertas (conta adiada ou antecipada).
    UPDATE public.tasks k
       SET due_date    = (t.due_date || 'T12:00:00Z')::TIMESTAMPTZ,
           description = 'Vencimento em ' || to_char(t.due_date, 'DD/MM/YYYY')
                         || ' • ' || public.fn_brl(t.amount),
           source_ref  = k.source_ref || jsonb_build_object('due', t.due_date::text)
      FROM public.internal_transactions t
     WHERE k.status       <> 'done'
       AND k.source_module = 'financeiro'
       AND k.source_ref->>'type' = 'internal_transaction'
       AND t.id::text = k.source_ref->>'id'
       AND t.due_date IS NOT NULL
       AND (k.source_ref->>'due') IS DISTINCT FROM t.due_date::text;

    -- 3. Cria as que faltam: uma por pessoa e VENCIMENTO.
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
               AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id)
               AND NOT EXISTS (
                   SELECT 1 FROM public.tasks k
                    WHERE k.user_id             = om.user_id
                      AND k.source_module       = 'financeiro'
                      AND k.source_ref->>'type' = 'internal_transaction'
                      AND k.source_ref->>'id'   = v_tx.id::text
                      AND (k.status <> 'done' OR k.source_ref->>'due' = v_tx.due_date::text))
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
                                       'due',   v_tx.due_date::text,
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
    'dias (mesmo filtro de fn_notif_pagamento_proximo). Uma por pessoa e vencimento: concluída '
    'não volta; conta paga/cancelada fecha a aberta; conta adiada muda a data. Job daily-payment-tasks.';

REVOKE ALL ON FUNCTION public.generate_payment_tasks(INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;
