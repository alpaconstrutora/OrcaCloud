-- migration: 20270104000000_processos_fase1_pilot_template.sql
-- Módulo ÒPURA Processos — Fase 1: template piloto ponta a ponta.
-- "Aprovação de pagamento de fornecedor" atravessa Fiscal→Obra→Financeiro→
-- Tesouraria e prova a tese de costura do P2P (ver PLANO_MODULO_PROCESSOS.md §7).
-- Idempotente (Regra de Ouro 10): para TODA organização sem este template,
-- semeia o template + 5 etapas. Não altera organizações que já o têm.

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
              AND t.name = 'Aprovação de pagamento de fornecedor'
        )
    LOOP
        INSERT INTO public.process_templates
            (organization_id, name, description, category, status, criticality, default_sla_hours, trigger_type)
        VALUES (
            org.id,
            'Aprovação de pagamento de fornecedor',
            'Template piloto do motor de Processos: conferência fiscal, validação da obra, '
            'aprovação financeira (por faixa de valor), agendamento e baixa do pagamento.',
            'Financeiro',
            'ATIVO',
            'ALTA',
            168, -- 7 dias corridos
            'MANUAL'
        )
        RETURNING id INTO new_template_id;

        INSERT INTO public.process_template_steps
            (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
        VALUES
            (new_template_id, 'Conferência Fiscal',
             'Conferir NF-e/boleto anexado contra o pedido de compra.',
             'document', 0, true, true, false, 48),
            (new_template_id, 'Validação da Obra',
             'Engenharia/obra confirma recebimento e execução do serviço/material.',
             'task', 1, true, false, false, 24),
            (new_template_id, 'Aprovação Financeira',
             'Aprovação por faixa de valor (1 ou 2 níveis, resolvido pelo approvalService).',
             'approval', 2, true, false, false, 72),
            (new_template_id, 'Agendamento do Pagamento',
             'Tesouraria agenda o pagamento no banco/Asaas.',
             'manual', 3, true, false, false, 24),
            (new_template_id, 'Baixa e Arquivamento',
             'Anexar comprovante de pagamento e encerrar o processo.',
             'document', 4, true, true, false, 24);
    END LOOP;
END $$;
