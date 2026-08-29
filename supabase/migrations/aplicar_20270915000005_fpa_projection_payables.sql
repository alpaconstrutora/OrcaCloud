-- ==========================================================================
-- FP&A · A projeção de caixa passa a enxergar o que é PREVISTO
-- Date: 2026-08-29
-- Altera: vw_fpa_cashflow_projection
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO
-- `vw_fpa_cashflow_projection` (20270107000000) é UNION de três fontes:
--   1. internal_transactions ... WHERE status = 'CONCILIATED'   → REALIZED
--   2. client_charges (PENDING|OVERDUE)                          → RECEIVABLE
--   3. supplier_payments (AWAITING_APPROVAL|APPROVED|PENDING|SCHEDULED) → PAYABLE
--
-- 🔴 Ou seja: do razão ela só lê o que JÁ FOI PAGO. Toda parcela em aberto —
-- de contrato, de pedido de compra e agora de financiamento — está fora da
-- "projeção" de caixa. O item 10 do PRD pede o impacto da dívida no caixa
-- projetado, e o fluxo mais previsível que existe (parcela de financiamento,
-- com data e valor contratados) era justamente o que não aparecia.
--
-- Esta migration acrescenta um QUARTO ramo lendo `vw_payables` no que ainda
-- não foi pago. De quebra resolve a mesma ausência para Contratos e Pedidos.
--
-- ⚠️ O CUIDADO QUE EVITA CONTAR DUAS VEZES: o ramo 1 já traz tudo que está
-- CONCILIATED. O ramo novo filtra `status <> 'CONCILIATED'` — não
-- `effective_status <> 'PAGO'`, que é coluna derivada e mudaria de significado
-- se a regra da view mudasse.
--
-- Confiança por origem, e não uma constante:
--   · DEBT_INSTALLMENT → HIGH. Data e valor vêm de contrato assinado; é a
--     saída mais previsível do caixa.
--   · o resto        → MEDIUM. Parcela de pedido/contrato ainda se move.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.views
                    WHERE table_schema = 'public' AND table_name = 'vw_fpa_cashflow_projection') THEN
        RAISE EXCEPTION 'ABORTADO: vw_fpa_cashflow_projection nao existe (rode 20270107000000 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.views
                    WHERE table_schema = 'public' AND table_name = 'vw_payables') THEN
        RAISE EXCEPTION 'ABORTADO: vw_payables nao existe (rode 20270840000000 antes).';
    END IF;
END $$;

-- Colunas e ordem IDÊNTICAS à definição vigente (lida do banco em 29/08), senão
-- o CREATE OR REPLACE é recusado.
CREATE OR REPLACE VIEW public.vw_fpa_cashflow_projection
WITH (security_invoker = on) AS
 SELECT internal_transactions.organization_id,
    internal_transactions.transaction_date AS event_date,
    'REALIZED'::text AS source_type,
    internal_transactions.category AS description,
        CASE
            WHEN internal_transactions.direction = 'CREDIT'::text THEN internal_transactions.amount
            ELSE 0::numeric
        END AS inflow_amount,
        CASE
            WHEN internal_transactions.direction = 'DEBIT'::text THEN internal_transactions.amount
            ELSE 0::numeric
        END AS outflow_amount,
    'HIGH'::text AS confidence_level
   FROM internal_transactions
  WHERE internal_transactions.status = 'CONCILIATED'::text
UNION ALL
 SELECT client_charges.organization_id,
    COALESCE(client_charges.due_date, CURRENT_DATE) AS event_date,
    'RECEIVABLE'::text AS source_type,
    client_charges.description,
    client_charges.value AS inflow_amount,
    0 AS outflow_amount,
    'MEDIUM'::text AS confidence_level
   FROM client_charges
  WHERE client_charges.status = ANY (ARRAY['PENDING'::text, 'OVERDUE'::text])
UNION ALL
 SELECT supplier_payments.organization_id,
    COALESCE(supplier_payments.scheduled_date, CURRENT_DATE) AS event_date,
    'PAYABLE'::text AS source_type,
    'Pagamento a Fornecedor'::text AS description,
    0 AS inflow_amount,
    supplier_payments.value AS outflow_amount,
    'HIGH'::text AS confidence_level
   FROM supplier_payments
  WHERE supplier_payments.status = ANY (ARRAY['AWAITING_APPROVAL'::text, 'APPROVED'::text, 'PENDING'::text, 'SCHEDULED'::text])
UNION ALL
 -- ── 4º ramo (2026-08-29): títulos a pagar ainda EM ABERTO ────────────────
 SELECT p.organization_id,
    COALESCE(p.due_date, p.transaction_date, CURRENT_DATE) AS event_date,
    CASE WHEN p.source_system = 'DEBT_INSTALLMENT'
         THEN 'DEBT'::text
         ELSE 'PAYABLE_OPEN'::text
    END AS source_type,
    COALESCE(p.description, p.category, 'Título a pagar'::text) AS description,
    0 AS inflow_amount,
    p.amount AS outflow_amount,
    CASE WHEN p.source_system = 'DEBT_INSTALLMENT'
         THEN 'HIGH'::text
         ELSE 'MEDIUM'::text
    END AS confidence_level
   FROM public.vw_payables p
  -- Sem este filtro, todo título pago entraria DE NOVO pelo ramo 1.
  WHERE p.status <> 'CONCILIATED'::text
    AND p.business_status IS DISTINCT FROM 'CANCELADO'::text;

COMMENT ON VIEW public.vw_fpa_cashflow_projection IS
    'Projecao de caixa. Ramos: REALIZED (razao conciliado), RECEIVABLE '
    '(client_charges em aberto), PAYABLE (supplier_payments agendados), '
    'PAYABLE_OPEN/DEBT (vw_payables ainda nao conciliado — acrescentado em '
    '2026-08-29). O 4o ramo filtra status <> CONCILIATED para nao contar duas '
    'vezes o que o 1o ja traz.';

REVOKE ALL ON public.vw_fpa_cashflow_projection FROM anon;
GRANT SELECT ON public.vw_fpa_cashflow_projection TO authenticated;

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. A view continua com security_invoker e sem anon:
-- SELECT relname, reloptions FROM pg_class WHERE relname='vw_fpa_cashflow_projection';
--    -> esperado: {security_invoker=on}
-- SELECT COUNT(*) FROM information_schema.role_table_grants
--  WHERE grantee='anon' AND table_name='vw_fpa_cashflow_projection';
--    -> esperado: 0
--
-- b. Os 5 tipos de origem aparecem (os que tiverem dado):
-- SELECT source_type, confidence_level, COUNT(*), SUM(outflow_amount)
--   FROM public.vw_fpa_cashflow_projection GROUP BY 1,2 ORDER BY 1;
--    -> esperado: REALIZED, RECEIVABLE, PAYABLE e agora PAYABLE_OPEN
--       (DEBT só depois do primeiro financiamento emitido)
--
-- c. 🔴 NÃO conta duas vezes — a prova que importa:
-- SELECT COUNT(*) AS titulos_pagos_no_ramo_novo
--   FROM public.vw_payables p WHERE p.status = 'CONCILIATED';
--    -> esse número é o que o ramo 4 EXCLUI. Confira que o total geral de
--       outflow subiu exatamente pelo somatório dos títulos EM ABERTO:
-- SELECT SUM(p.amount) FROM public.vw_payables p
--  WHERE p.status <> 'CONCILIATED' AND p.business_status IS DISTINCT FROM 'CANCELADO';
--
-- d. Nenhum lançamento aparece nos dois ramos ao mesmo tempo:
-- SELECT COUNT(*) FROM public.vw_payables p
--   JOIN public.internal_transactions it ON it.id = p.id
--  WHERE p.status <> 'CONCILIATED' AND it.status = 'CONCILIATED';
--    -> esperado: 0 (a view lê a mesma coluna; é impossível por construção,
--       mas confirma que `status` não foi reescrito no caminho)
-- ==========================================================================
-- FIM: aplicar_20270915000005_fpa_projection_payables.sql
-- ==========================================================================
