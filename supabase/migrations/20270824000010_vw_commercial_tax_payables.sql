-- ==========================================================================
-- vw_commercial_tax_payables — Tributos a Pagar (Comercial)
-- Date: 2026-07-24
-- ==========================================================================
-- CONTEXTO
-- Financeiro › Tributos a Pagar lista as retenções/tributos (IRRF, PIS,
-- COFINS, CSLL, …) gerados a partir das receitas do Comercial — Vendas de
-- Ativos (deal.type='SALE') e Locações (deal.type='RENTAL'). Cada tributo é
-- calculado por taxPayableService.generateForDeal aplicando a alíquota
-- cadastrada em Configurações do Sistema › Tributos e Impostos (tax_settings)
-- sobre o valor do negócio.
--
-- Os tributos são materializados em internal_transactions (mesma tabela dos
-- recebíveis), mas do lado do passivo (direction='DEBIT'), com um discriminador
-- próprio para não se misturarem com nada mais:
--   • direction     = 'DEBIT'
--   • party_type    = 'TAX'        ← discriminador exclusivo desta view
--   • source_system = 'COMMERCIAL' ← isenta o hard-lock de período (trg_block_period_internal_tx)
--   • party_name    = nome do tributo (PIS/COFINS/IRRF/CSLL/…)
--   • category      = origem ('Venda de Ativo' | 'Locação' | 'Manual')
--   • reference_id  = 'tax-{dealId}-{taxId}' (auto)  |  NULL (lançamento manual)
--   • business_status = 'PREVISTO' | 'PAGO' | 'CANCELADO'
--
-- Contas a Pagar (ProjectFinancialManager/invoiceService) usa a tabela
-- `invoices`, NÃO internal_transactions — logo não há colisão. Recebíveis
-- (vw_receivables) filtram direction='CREDIT'; aqui é DEBIT. party_type='TAX'
-- isola dos demais DEBIT (ex.: comissão de corretor tx-comm).
--
-- effective_status: VENCIDO computado dinamicamente (sem cron), mesma lógica
-- de vw_receivables — PREVISTO + due_date < hoje ⇒ VENCIDO. Paga = 'PAGO'.
-- ==========================================================================

DROP VIEW IF EXISTS public.vw_commercial_tax_payables;

CREATE VIEW public.vw_commercial_tax_payables AS
SELECT
  it.id,
  it.organization_id,
  it.source_system,
  it.reference_id,
  it.transaction_date,
  it.due_date,
  it.amount,
  it.direction,
  it.description,
  it.category,
  it.status,
  it.business_status,
  it.party_id,
  it.party_name,
  it.party_type,
  it.project_id,
  it.cost_center_id,
  it.created_at,
  it.updated_at,
  CASE
    WHEN COALESCE(it.business_status, 'PREVISTO') IN ('PREVISTO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction  = 'DEBIT'
  AND it.party_type = 'TAX'
  AND it.status    <> 'CANCELLED';

-- ==========================================================================
-- FIM: 20270824000010_vw_commercial_tax_payables.sql
-- ==========================================================================
