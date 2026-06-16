-- migration: 20261202000002_vencimento_alerts_cron.sql
-- Cron diário (08h00 UTC) que cria client_portal_messages do tipo 'vencimento'
-- para clientes com parcelas vencendo em 3 dias (não pagas/canceladas).
-- Idempotente: ignora se já existe alerta para o mesmo cliente+data nas últimas 24h.

-- ─────────────────────────────────────────────────────────────────────────────
-- Função principal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_vencimento_alerts(p_days_ahead INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_date DATE := CURRENT_DATE + p_days_ahead;
    v_rec         RECORD;
    v_created     INTEGER := 0;
    v_label       TEXT;
BEGIN
    -- Percorre todos os projetos com financialInfo.installments populado
    FOR v_rec IN
        SELECT
            (inst->>'clientId')::UUID                         AS client_id,
            c.organization_id                                 AS organization_id,
            (inst->>'dueDate')::DATE                          AS due_date,
            COALESCE((inst->>'value')::NUMERIC, 0)            AS value,
            COALESCE(inst->>'description', 'Parcela')         AS description
        FROM public.projects p
        CROSS JOIN LATERAL jsonb_array_elements(
            p.settings->'financialInfo'->'installments'
        ) AS inst
        JOIN public.clients c ON c.id = (inst->>'clientId')::UUID
        WHERE
            -- status pendente
            UPPER(COALESCE(inst->>'status', 'PENDING')) NOT IN ('PAID', 'CANCELLED')
            -- vence exatamente daqui a p_days_ahead dias
            AND (inst->>'dueDate')::DATE = v_target_date
            -- cliente existe e tem org
            AND (inst->>'clientId') IS NOT NULL
            AND c.organization_id IS NOT NULL
    LOOP
        v_label := TO_CHAR(v_rec.due_date, 'DD/MM/YYYY');

        -- Idempotência: não envia se já existe alerta para este cliente+data
        IF EXISTS (
            SELECT 1 FROM public.client_portal_messages
            WHERE client_id = v_rec.client_id
              AND type       = 'vencimento'
              AND created_at > NOW() - INTERVAL '36 hours'
              AND title LIKE '%' || v_label || '%'
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.client_portal_messages
            (organization_id, client_id, sender_name, type, title, body)
        VALUES (
            v_rec.organization_id,
            v_rec.client_id,
            'Sistema',
            'vencimento',
            'Parcela vence em ' || p_days_ahead || ' dias — ' || v_label,
            'Você tem uma parcela de R$ ' ||
                TO_CHAR(v_rec.value, 'FM999G999G990D00') ||
                ' com vencimento em ' || v_label || '. ' ||
                'Acesse a área financeira para mais detalhes.'
        );

        v_created := v_created + 1;
    END LOOP;

    RETURN v_created;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamento via pg_cron — 08h00 UTC diariamente
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('vencimento-portal-alerts')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'vencimento-portal-alerts'
);

SELECT cron.schedule(
    'vencimento-portal-alerts',
    '0 8 * * *',
    $$SELECT public.fn_vencimento_alerts(3);$$
);
