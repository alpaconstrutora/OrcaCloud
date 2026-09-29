-- migration: aplicar_20270928000001_processos_fase3_eventos.sql
-- Módulo ÒPURA Processos — Fase 3 / Passo 3 do plano
-- docs/planos/2026-09-28-torre-p2p-processos.md: quatro eventos novos do P2P
-- ganham um template EVENTO por organização.
--
-- SEM tabela nova, SEM policy, SEM função — só seed. Idempotente por
-- (organização, trigger_event_key): reexecutar não duplica; organização que
-- já tenha customizado um template para a chave é deixada em paz.
--
-- Quem emite cada chave (código): ver `ProcessEventKey` em types/process.ts.
--   purchase_order.approved      orderService.approveOrder (alçada fechou)
--   nfe.linked                   nfeService.approveAndLink / linkExistingTransaction
--   purchase_receipt.divergence  receiptService.createReceipt (divergência de item)
--   internal_transaction.paid    payableService.updateStatus('PAGO') / fn_reconcile_match
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.

DO $$
DECLARE
    org RECORD;
    tpl UUID;
BEGIN
    FOR org IN SELECT o.id FROM public.organizations o LOOP

        -- ── 1. Pedido aprovado → emissão e acompanhamento ───────────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'purchase_order.approved'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Pedido aprovado — emissão e acompanhamento',
                'Disparado quando a alçada do pedido de compra fecha em APROVADO. '
                'Conduz o envio ao fornecedor e o acompanhamento da entrega.',
                'Suprimentos', 'ATIVO', 'MEDIA', 120, 'EVENTO', 'purchase_order.approved')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Envio ao fornecedor',
                 'Enviar o pedido aprovado ao fornecedor (portal, e-mail ou WhatsApp).',
                 'task', 0, true, false, false, 24),
                (tpl, 'Confirmação do fornecedor',
                 'Registrar a confirmação de prazo e condições pelo fornecedor.',
                 'manual', 1, true, false, false, 48),
                (tpl, 'Acompanhamento da entrega',
                 'Acompanhar separação, transporte e entrega até o recebimento.',
                 'task', 2, true, false, true, 72);
        END IF;

        -- ── 2. NF-e vinculada → conferência contra o pedido ─────────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'nfe.linked'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Conferência de NF-e vinculada ao pedido',
                'Disparado quando uma NF-e é vinculada a um título de pedido de compra. '
                'Confere documento, casa Pedido × Recebimento × Nota e libera o pagamento.',
                'Fiscal', 'ATIVO', 'ALTA', 72, 'EVENTO', 'nfe.linked')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Conferência fiscal do documento',
                 'Validar CFOP/CST/NCM, destinatário e valores da NF-e.',
                 'document', 0, true, true, false, 24),
                (tpl, '3-way match — Pedido × Recebimento × Nota',
                 'Conferir quantidades e valores da nota contra pedido e recebimento (aba Recebimento do pedido).',
                 'validation', 1, true, false, false, 24),
                (tpl, 'Liberação para pagamento',
                 'Aprovar o título para a fila de pagamento.',
                 'approval', 2, true, false, false, 24);
        END IF;

        -- ── 3. Divergência de item no recebimento ───────────────────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'purchase_receipt.divergence'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Divergência de itens no recebimento',
                'Disparado quando um recebimento registra item quebrado, faltando ou parcial '
                'sem que o pedido inteiro seja marcado como Divergência.',
                'Suprimentos', 'ATIVO', 'ALTA', 72, 'EVENTO', 'purchase_receipt.divergence')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Registro da divergência de itens',
                 'Descrever os itens divergentes e a quantidade afetada.',
                 'manual', 0, true, false, false, 24),
                (tpl, 'Evidências',
                 'Anexar fotos ou laudo dos itens divergentes.',
                 'document', 1, true, true, false, 24),
                (tpl, 'Acerto com o fornecedor',
                 'Combinar reposição, troca ou abatimento com o fornecedor.',
                 'task', 2, true, false, false, 48),
                (tpl, 'Encerramento',
                 'Confirmar o acerto e encerrar a divergência.',
                 'manual', 3, true, false, false, 24);
        END IF;

        -- ── 4. Título de pedido pago → pós-pagamento ────────────────────────
        IF NOT EXISTS (
            SELECT 1 FROM public.process_templates t
            WHERE t.organization_id = org.id AND t.trigger_event_key = 'internal_transaction.paid'
        ) THEN
            INSERT INTO public.process_templates
                (organization_id, name, description, category, status, criticality,
                 default_sla_hours, trigger_type, trigger_event_key)
            VALUES (org.id,
                'Pós-pagamento de fornecedor',
                'Disparado quando um título de pedido de compra é baixado (manualmente ou por conciliação). '
                'Arquiva o comprovante e encerra as pendências do pedido.',
                'Financeiro', 'ATIVO', 'BAIXA', 48, 'EVENTO', 'internal_transaction.paid')
            RETURNING id INTO tpl;

            INSERT INTO public.process_template_steps
                (process_template_id, name, description, step_type, order_index, is_required, requires_document, can_skip, sla_hours)
            VALUES
                (tpl, 'Arquivamento do comprovante',
                 'Anexar o comprovante de pagamento ao pedido.',
                 'document', 0, true, true, false, 24),
                (tpl, 'Encerramento do pedido',
                 'Conferir que não restam pendências (itens, notas, divergências) e encerrar.',
                 'manual', 1, true, false, true, 24);
        END IF;

    END LOOP;
END $$;
