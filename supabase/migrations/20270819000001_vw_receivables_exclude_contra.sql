-- ==========================================================================
-- vw_receivables — excluir o lançamento-espelho da partida dobrada (entry_type='CONTRA')
-- Date: 2026-07-19
-- ==========================================================================
-- CONTEXTO
-- nfeService grava CADA NF-e como DOIS lançamentos em internal_transactions
-- (partida dobrada, ver migration da unique key org_ref_key):
--   • PRINCIPAL: direction=DEBIT,  category='Material'             (a despesa em si)
--   • CONTRA:    direction=CREDIT, category='Fornecedores a Pagar' (espelho contábil
--     do passivo — NÃO é um recebível de cliente, é só o lado credor do lançamento
--     em partida dobrada).
--
-- vw_receivables filtrava só por `direction = 'CREDIT'`, sem olhar entry_type.
-- Resultado: o CONTRA da NF-e (que é CREDIT por definição contábil) vazava para
-- Contas a Receber, aparecendo sem cliente (é uma nota de FORNECEDOR, não tem
-- party_name de cliente para preencher).
--
-- Contas a Pagar (ContasPagarManager/invoiceService) usa a tabela `invoices`,
-- não `internal_transactions`/vw_receivables — então este filtro não afeta
-- Contas a Pagar. Hoje só existem linhas CONTRA em direction=CREDIT (2 no banco),
-- mas o filtro é escrito de forma simétrica para não vazar se um dia existir
-- CONTRA em DEBIT também.
-- ==========================================================================

DROP VIEW IF EXISTS public.vw_receivables;

CREATE VIEW public.vw_receivables AS
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
  -- status efetivo: VENCIDO é computado dinamicamente para não exigir cron
  CASE
    WHEN it.business_status IN ('PREVISTO','EMITIDO','ENVIADO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction = 'CREDIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

-- ==========================================================================
-- FIM: 20270819000001_vw_receivables_exclude_contra.sql
-- ==========================================================================
