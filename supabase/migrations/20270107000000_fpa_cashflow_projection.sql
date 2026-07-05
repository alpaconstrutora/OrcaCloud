-- ============================================================
-- FP&A Module - Fase 2: Fluxo de Caixa Projetado
-- OrçaCloud SaaS - Migration 20270107000000
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- A view vw_fpa_cashflow_projection consolida as movimentações financeiras para montar
-- o fluxo de caixa histórico e projetado.
-- Utiliza:
-- 1. internal_transactions (status = 'CONCILIATED') para o realizado/histórico.
-- 2. client_charges (status pendente) para contas a receber futuras.
-- 3. supplier_payments (status pendente) para contas a pagar futuras.

DROP VIEW IF EXISTS public.vw_fpa_cashflow_projection;

CREATE OR REPLACE VIEW public.vw_fpa_cashflow_projection AS
-- 1. REALIZADO (Histórico)
SELECT 
    organization_id,
    transaction_date AS event_date,
    'REALIZED' AS source_type,
    category AS description,
    CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END AS inflow_amount,
    CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END AS outflow_amount,
    'HIGH' AS confidence_level
FROM public.internal_transactions
WHERE status = 'CONCILIATED'

UNION ALL

-- 2. CONTAS A RECEBER (Futuro)
SELECT 
    organization_id,
    COALESCE(due_date, CURRENT_DATE) AS event_date,
    'RECEIVABLE' AS source_type,
    description,
    value AS inflow_amount,
    0 AS outflow_amount,
    'MEDIUM' AS confidence_level
FROM public.client_charges
WHERE status IN ('PENDING', 'OVERDUE')

UNION ALL

-- 3. CONTAS A PAGAR (Futuro)
SELECT 
    organization_id,
    COALESCE(scheduled_date, CURRENT_DATE) AS event_date,
    'PAYABLE' AS source_type,
    'Pagamento a Fornecedor' AS description,
    0 AS inflow_amount,
    value AS outflow_amount,
    'HIGH' AS confidence_level
FROM public.supplier_payments
WHERE status IN ('AWAITING_APPROVAL', 'APPROVED', 'PENDING', 'SCHEDULED');

-- Permissões
GRANT SELECT ON public.vw_fpa_cashflow_projection TO authenticated;
GRANT SELECT ON public.vw_fpa_cashflow_projection TO service_role;
