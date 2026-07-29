-- ==========================================================================
-- vw_payables — Contas a Pagar passa a ler as parcelas, não só notas fiscais
-- Date: 2026-07-29
-- ==========================================================================
-- CONTEXTO
-- As parcelas geradas por Suprimentos > Pedidos (financialService.addTransaction,
-- source_system='PURCHASE_ORDER') e por Suprimentos > Contratos
-- (contractService, source_system='CONTRACT_PARCELADO'/'CONTRACT_MEASUREMENT')
-- já eram gravadas em internal_transactions com direction='DEBIT'.
--
-- Só que ninguém as lia: a tela "Contas a Pagar" (ContasPagarManager) consultava
-- exclusivamente a tabela `invoices` — ou seja, era um conferidor de notas
-- fiscais anexadas ao pedido, não o contas a pagar da empresa. O espelho
-- `vw_receivables` existe desde 20261118 para o lado CREDIT; o lado DEBIT nunca
-- teve view. Resultado: parcela de pedido e de contrato existia no banco e não
-- aparecia em lugar nenhum do financeiro.
--
-- Esta view é o espelho exato de vw_receivables com direction='DEBIT',
-- incluindo a regra de VENCIDO com COALESCE na condição (ver 20270819000002:
-- `NULL IN (...)` resolve para NULL, não TRUE, então business_status nulo
-- travava tudo em PREVISTO para sempre — a view não pode depender de o produtor
-- lembrar de preencher a coluna).
--
-- entry_type='CONTRA' é excluído pelo mesmo motivo de 20270819000001: é o
-- espelho contábil de partida dobrada da NF-e, não um título a pagar.
--
-- security_invoker=on é OBRIGATÓRIO: sem ele a view roda como o dono e ignora
-- a RLS de internal_transactions, vazando lançamentos entre organizações.
-- ==========================================================================

DROP VIEW IF EXISTS public.vw_payables;

CREATE VIEW public.vw_payables
WITH (security_invoker = on) AS
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
  it.entity_name,
  it.project_id,
  it.cost_center_id,
  it.created_at,
  it.updated_at,
  -- status efetivo: VENCIDO é computado dinamicamente para não exigir cron.
  -- COALESCE na condição (não só no ELSE): business_status nulo = PREVISTO.
  CASE
    WHEN COALESCE(it.business_status, 'PREVISTO') IN ('PREVISTO','EMITIDO','ENVIADO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction = 'DEBIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

-- RPC/view nova = REVOKE PUBLIC. GRANT a authenticated sozinho não bloqueia
-- anon, porque anon herda de PUBLIC.
REVOKE ALL ON public.vw_payables FROM PUBLIC;
GRANT SELECT ON public.vw_payables TO authenticated;

-- ==========================================================================
-- BACKFILL — parcelas antigas nasceram sem due_date e sem business_status
-- ==========================================================================
-- addTransaction gravava só transaction_date. Sem due_date a parcela aparece
-- sem vencimento e nunca é marcada VENCIDA. Como a data de vencimento já era
-- a data usada em transaction_date (addTransaction recebe a data de vencimento
-- calculada, não a data de emissão), copiar uma na outra é fiel ao dado.
--
-- Restrito a source_system='PROJECT' + DEBIT: são exatamente as linhas do
-- produtor defeituoso. CONTRACT_PARCELADO já gravava due_date corretamente.
UPDATE public.internal_transactions
   SET due_date = transaction_date
 WHERE source_system = 'PROJECT'
   AND direction     = 'DEBIT'
   AND due_date IS NULL
   AND transaction_date IS NOT NULL;

UPDATE public.internal_transactions
   SET business_status = CASE WHEN status = 'CONCILIATED' THEN 'PAGO' ELSE 'PREVISTO' END
 WHERE source_system  = 'PROJECT'
   AND direction      = 'DEBIT'
   AND business_status IS NULL;

-- Fornecedor NÃO é backfillável aqui: o nome vivia só no JSONB
-- projects.settings.financialInfo.transactions[].supplier, fora do alcance do
-- SQL. Parcelas antigas ficam com contraparte vazia até o pedido ser
-- re-sincronizado (financialService.syncOrderToFinance recria as pendentes).

-- ==========================================================================
-- FIM: 20270840000000_vw_payables_parcelas_suprimentos.sql
-- ==========================================================================
