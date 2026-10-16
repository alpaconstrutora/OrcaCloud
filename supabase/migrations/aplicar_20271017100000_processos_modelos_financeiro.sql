-- ============================================================
-- Processos — modelos dos quatro eventos do Financeiro
-- Plano: docs/planos/2026-10-16-torre-fluxo-financeiro.md (seção E)
--
-- Pedido (16/10/2026, depois da Torre do Financeiro publicada em d6520791):
-- "Vamos criar" os modelos de processo dos eventos novos. Decisões do usuário:
--   • os QUATRO eventos ganham modelo: boleto.approved, payable.approved,
--     payable.settled, receivable.settled;
--   • TODO título abre processo (sem valor mínimo) — volume medido na Alpa nos
--     30 dias anteriores: 781 boletos aprovados, 102 títulos liberados na
--     alçada, 274 títulos pagos, 3 recebimentos;
--   • nas QUATRO organizações, como os modelos do P2P
--     (aplicar_20270928000001_processos_fase3_eventos.sql).
--
-- Mesmo molde daquela carga: sem dono e sem responsável por etapa (quem assume
-- é um membro da organização; o dono se define no editor do modelo). SEM
-- tabela, SEM policy, SEM função — só dados. Idempotente por
-- (organização, trigger_event_key): reexecutar não duplica, e organização que
-- já tenha um modelo para a chave é deixada em paz.
--
-- Quem emite cada chave: ver `ProcessEventKey` em types/process.ts.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- ============================================================

DO $$
DECLARE
    org RECORD;
    tpl UUID;
BEGIN
    FOR org IN SELECT o.id FROM public.organizations o LOOP

        -- ── 1. Boleto aprovado → conferência da classificação ───────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'boleto.approved'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Boleto aprovado — conferência de classificação',
                'Disparado quando um boleto é aprovado e o título nasce dele. '
                'Confere centro de custo, plano de contas e obra antes do pagamento.',
                'Financeiro', 'ATIVO', 'BAIXA', 24, 'EVENTO', 'boleto.approved')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Conferir classificação',
                 'Centro de custo, plano de contas e obra do título nascido do boleto.',
                 'task', 0, true, false, false, 24);
        END IF;

        -- ── 2. Título aprovado na alçada → programar pagamento ──────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'payable.approved'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Programar pagamento',
                'Disparado quando a alçada do título a pagar fecha em aprovado '
                '(inclusive a liberação abaixo do piso). Agenda o pagamento e guarda o comprovante.',
                'Financeiro', 'ATIVO', 'MEDIA', 96, 'EVENTO', 'payable.approved')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Programar pagamento',
                 'Agendar no banco ou no Asaas.',
                 'task', 0, true, false, false, 24),
                (tpl, 'Anexar comprovante',
                 'Comprovante do agendamento ou do pagamento.',
                 'document', 1, true, true, false, 72);
        END IF;

        -- ── 3. Título a pagar baixado → pós-pagamento ───────────────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'payable.settled'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Pós-pagamento: comprovante e conciliação',
                'Disparado quando um título a pagar de qualquer origem é baixado no app '
                '(painel, boleto marcado como pago ou conciliação). Confere comprovante e extrato.',
                'Financeiro', 'ATIVO', 'BAIXA', 120, 'EVENTO', 'payable.settled')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Conferir comprovante',
                 'O comprovante do pagamento está anexado e bate com o título?',
                 'document', 0, true, true, false, 48),
                (tpl, 'Conferir conciliação',
                 'O título baixado casou com um movimento do extrato?',
                 'task', 1, true, false, false, 72);
        END IF;

        -- ── 4. Título a receber recebido → recibo e conciliação ─────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'receivable.settled'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Recebimento: recibo e conciliação',
                'Disparado quando um título a receber é recebido no app (painel ou conciliação). '
                'Emite o recibo ao cliente e confere o extrato.',
                'Financeiro', 'ATIVO', 'MEDIA', 96, 'EVENTO', 'receivable.settled')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Emitir recibo ao cliente',
                 'Recibo numerado a partir da baixa (Contas a Receber).',
                 'task', 0, true, false, false, 24),
                (tpl, 'Conferir conciliação',
                 'O recebimento casou com um movimento do extrato?',
                 'task', 1, true, false, false, 72);
        END IF;

    END LOOP;
END $$;
