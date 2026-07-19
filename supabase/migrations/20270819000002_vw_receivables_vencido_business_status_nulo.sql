-- ==========================================================================
-- vw_receivables — VENCIDO deixa de depender de business_status preenchido
-- Date: 2026-07-19
-- ==========================================================================
-- CONTEXTO
-- A regra de VENCIDO era:
--     WHEN it.business_status IN ('PREVISTO','EMITIDO','ENVIADO')
--          AND it.due_date < CURRENT_DATE THEN 'VENCIDO'
--
-- Só que `NULL IN (...)` resolve para NULL — não TRUE — então todo recebível
-- com business_status nulo caía no ELSE e virava 'PREVISTO' para sempre,
-- mesmo vencido há meses. E business_status É nulo em tudo que vem de sync:
-- financialSyncService e as 3 funções de sync de contrato nunca preencheram a
-- coluna (só receivableService.create, o lançamento manual, preenchia).
--
-- Resultado prático: 40 de 40 recebíveis com business_status nulo, 14 deles já
-- vencidos, e o KPI "Vencidos" + o painel de Inadimplência marcavam ZERO —
-- subestimando a inadimplência silenciosamente. O ELSE já usava
-- COALESCE(...,'PREVISTO'); a condição do VENCIDO é que não usava.
--
-- Correção defensiva: COALESCE também na condição. Assim a view fica correta
-- independentemente de o produtor do dado lembrar de preencher a coluna — o
-- código também passou a preencher, mas a view não depende mais disso.
--
-- Mantém a exclusão de entry_type='CONTRA' introduzida em 20270819000001
-- (espelho contábil da NF-e não é recebível).
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
WHERE it.direction = 'CREDIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

-- ==========================================================================
-- FIM: 20270819000002_vw_receivables_vencido_business_status_nulo.sql
-- ==========================================================================
