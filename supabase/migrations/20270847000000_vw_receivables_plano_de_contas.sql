-- ==========================================================================
-- vw_receivables — expõe plano_de_contas_id (Contas a Receber)
-- Date: 2026-08-01
-- ==========================================================================
-- Pedido do usuário: colunas Centro de Custo e Plano de Contas em Contas a
-- Receber. `cost_center_id` já era exposto pela view (desde a criação); só
-- faltava `plano_de_contas_id`, adicionada em `internal_transactions` pela
-- migration 20270846000000 mas nunca propagada para cá.
--
-- São dimensões DIFERENTES — ver 20270822000013_restore_plano_de_contas.sql:
--   • Centro de Custo  → cost_centers_v2 (via cost_center_id)
--   • Plano de Contas  → plano_de_contas (via plano_de_contas_id)
-- Só o ID: o app resolve o nome no client via financialRegistryService
-- (listCostCenters/listPlanoContas), mesmo padrão de BankReconciliation —
-- Centro de Custo usa nome hierárquico "Grupo > Subgrupo" que um JOIN simples
-- na view não reproduziria.
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
  it.plano_de_contas_id,
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

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- FIM: 20270847000000_vw_receivables_plano_de_contas.sql
-- ==========================================================================
