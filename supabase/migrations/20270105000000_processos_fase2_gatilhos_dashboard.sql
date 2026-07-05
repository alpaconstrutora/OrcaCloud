-- migration: 20270105000000_processos_fase2_gatilhos_dashboard.sql
-- Módulo ÒPURA Processos — Fase 2: costura com o P2P (gatilhos de evento) +
-- dashboard de SLA/gargalo por etapa. Ver PLANO_MODULO_PROCESSOS.md §6/§7.
-- Idempotente (Regra de Ouro 10).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chave de gatilho — só usada quando trigger_type='EVENTO'. O motor de
--    Processos escuta eventos do P2P (order.status) e casa por esta chave.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.process_templates
    ADD COLUMN IF NOT EXISTS trigger_event_key TEXT;

COMMENT ON COLUMN public.process_templates.trigger_event_key IS
    'Chave do evento que dispara a instância automaticamente (ex.: purchase_order.received, '
    'purchase_order.divergence). Só relevante quando trigger_type=''EVENTO''.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Liga o template piloto (Fase 1) ao evento de recebimento do pedido —
--    a costura real: Recebido → nasce o processo de conferência/pagamento.
--    Guarda por trigger_event_key IS NULL para não sobrescrever customização.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.process_templates
SET trigger_type = 'EVENTO', trigger_event_key = 'purchase_order.received'
WHERE name = 'Aprovação de pagamento de fornecedor'
  AND trigger_event_key IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Novo template piloto de costura: Divergência de pedido → tratamento.
--    Idempotente por organização (mesmo padrão da migration Fase 1).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    org RECORD;
    new_template_id UUID;
BEGIN
    FOR org IN
        SELECT o.id
        FROM public.organizations o
        WHERE NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = o.id
              AND t.name = 'Tratamento de Divergência de Pedido'
        )
    LOOP
        INSERT INTO public.process_templates
            (organization_id, name, description, category, status, criticality,
             default_sla_hours, trigger_type, trigger_event_key)
        VALUES (
            org.id,
            'Tratamento de Divergência de Pedido',
            'Disparado automaticamente quando um pedido de compra é marcado como '
            'Divergência no recebimento (costura P2P — ver PLANO_MODULO_PROCESSOS.md §6).',
            'Suprimentos',
            'ATIVO',
            'ALTA',
            72,
            'EVENTO',
            'purchase_order.divergence'
        )
        RETURNING id INTO new_template_id;

        INSERT INTO public.process_template_steps
            (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
        VALUES
            (new_template_id, 'Registro da Divergência',
             'Obra/almoxarifado descreve o que diverge do pedido.',
             'manual', 0, true, false, false, 24),
            (new_template_id, 'Evidências da Divergência',
             'Anexar fotos/laudo comprovando a divergência.',
             'document', 1, true, true, false, 24),
            (new_template_id, 'Aprovação do Plano de Correção',
             'Suprimentos aprova devolução, troca ou desconto negociado.',
             'approval', 2, true, false, false, 48),
            (new_template_id, 'Execução da Correção',
             'Fornecedor/obra executa a correção acordada.',
             'task', 3, true, false, false, 72),
            (new_template_id, 'Vistoria Final',
             'Confirma que a divergência foi sanada e encerra o processo.',
             'manual', 4, true, false, false, 24);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_process_bottlenecks — dashboard de SLA/gargalo por etapa (agregado por
--    nome de etapa, cruzando todos os templates da organização).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_process_bottlenecks(p_organization_id UUID)
RETURNS TABLE (
    step_name TEXT,
    step_type TEXT,
    avg_hours NUMERIC,
    completed_count BIGINT,
    active_count BIGINT,
    overdue_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.name,
        s.step_type,
        ROUND(
            AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600.0)
                FILTER (WHERE s.completed_at IS NOT NULL AND s.started_at IS NOT NULL),
        1) AS avg_hours,
        COUNT(*) FILTER (WHERE s.status = 'CONCLUIDO') AS completed_count,
        COUNT(*) FILTER (WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO')) AS active_count,
        COUNT(*) FILTER (
            WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO') AND s.due_at IS NOT NULL AND s.due_at < now()
        ) AS overdue_count
    FROM public.process_instance_steps s
    JOIN public.process_instances i ON i.id = s.process_instance_id
    WHERE i.organization_id = p_organization_id
    GROUP BY s.name, s.step_type
    ORDER BY avg_hours DESC NULLS LAST;
$$;
