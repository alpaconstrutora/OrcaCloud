-- ============================================================
-- Cron: gerador diário de tarefas para contas a pagar vencendo
-- Roda às 07h00 UTC todos os dias.
-- Lógica: para cada internal_transaction DEBIT PENDING vencendo
-- nos próximos 3 dias, cria uma tarefa para cada membro da org.
-- Idempotente via uq_tasks_source_open (duplicatas são ignoradas).
-- ============================================================

-- 1. Função SQL que encapsula a lógica (chamável pelo cron ou manualmente)
CREATE OR REPLACE FUNCTION public.generate_payment_tasks(p_days_ahead INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today        DATE    := CURRENT_DATE;
    v_limit        DATE    := CURRENT_DATE + p_days_ahead;
    v_tx           RECORD;
    v_member       RECORD;
    v_created      INTEGER := 0;
    v_amt_text     TEXT;
BEGIN
    FOR v_tx IN
        SELECT
            t.reference_id,
            t.description,
            t.amount,
            t.transaction_date,
            t.category,
            t.organization_id
        FROM public.internal_transactions t
        WHERE t.direction          = 'DEBIT'
          AND t.status             = 'PENDING'
          AND t.transaction_date  >= v_today
          AND t.transaction_date  <= v_limit
    LOOP
        -- formata valor (ex: "R$ 1.250,00")
        v_amt_text := 'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00');

        FOR v_member IN
            SELECT om.user_id
            FROM public.organization_members om
            WHERE om.organization_id = v_tx.organization_id
              AND om.user_id IS NOT NULL
        LOOP
            PERFORM public.create_task(
                p_user_id       := v_member.user_id,
                p_org_id        := v_tx.organization_id,
                p_title         := 'Pagar: ' || COALESCE(v_tx.description, v_tx.category, 'Conta a pagar'),
                p_due           := (v_tx.transaction_date || 'T12:00:00Z')::TIMESTAMPTZ,
                p_source_module := 'financeiro',
                p_source_ref    := jsonb_build_object(
                                       'type', 'internal_transaction',
                                       'id',   v_tx.reference_id,
                                       'route','financial'
                                   ),
                p_priority      := 1,
                p_description   := 'Vencimento em ' || v_tx.transaction_date::TEXT || ' • ' || v_amt_text
            );
            v_created := v_created + 1;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.generate_payment_tasks IS
    'Gerador diário de tarefas para contas a pagar vencendo em N dias. '
    'Idempotente: duplicatas ignoradas por uq_tasks_source_open.';

-- 2. Agendar com pg_cron — 07h00 UTC todos os dias
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-payment-tasks') THEN
        PERFORM cron.unschedule('daily-payment-tasks');
    END IF;
END $$;

SELECT cron.schedule(
    'daily-payment-tasks',
    '0 7 * * *',    -- 07:00 UTC = 04:00 BRT / 08:00 BRT (dependendo do horário de verão)
    $$ SELECT public.generate_payment_tasks(3); $$
);
