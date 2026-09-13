-- ============================================================
-- Gestão de Ativos → Financeiro: backfill dos títulos de manutenção
-- OrçaCloud SaaS · Migration 20270919000038
-- (nasceu como 20270919000030, renomeada antes do commit por colisão de prefixo;
--  já aplicada em produção em 2026-09-13 — idempotente.)
-- Idempotente (ON CONFLICT DO NOTHING na chave org+reference_id+entry_type).
--
-- Contexto: até 2026-09-13 o custo de uma manutenção ficava só em
-- opura_asset_maintenances — nunca virava lançamento, então não entrava
-- em Contas a Pagar, DRE nem ÒPURA · Relatórios. A partir desta data o
-- frontend (assetService.syncMaintenanceFinance) gera/atualiza o título
-- a cada criar/editar/concluir/cancelar. Este arquivo cobre o que já
-- existia. Espelha utils/assetMaintenanceFinance.ts:
--   source_system  = 'ASSET_MAINTENANCE'
--   reference_id   = 'asset-maintenance-<id>'
--   datas          = executed_date ?? scheduled_date
--   só custo > 0 e status <> 'cancelada'
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

INSERT INTO public.internal_transactions (
  organization_id, source_system, reference_id, entry_type,
  transaction_date, due_date, amount, direction, description, category,
  status, business_status, cost_center_id, project_id
)
SELECT
  m.organization_id,
  'ASSET_MAINTENANCE',
  'asset-maintenance-' || m.id::text,
  'PRINCIPAL',
  COALESCE(m.executed_date, m.scheduled_date),
  COALESCE(m.executed_date, m.scheduled_date),
  m.cost,
  'DEBIT',
  regexp_replace(trim(
    'Manutenção ' || CASE m.type WHEN 'calibracao' THEN 'calibração' ELSE m.type END
    || CASE WHEN COALESCE(a.code, '') <> '' OR COALESCE(a.name, '') <> ''
            THEN ' — ' || trim(COALESCE(a.code, '') || ' ' || COALESCE(a.name, '')) ELSE '' END
    || CASE WHEN COALESCE(trim(m.description), '') <> '' THEN ': ' || trim(m.description) ELSE '' END
  ), '\s+', ' ', 'g'),
  'Manutenção de Ativos',
  'PENDING',
  'PREVISTO',
  m.cost_center_id,
  a.current_project_id
FROM public.opura_asset_maintenances m
LEFT JOIN public.opura_assets a ON a.id = m.asset_id
WHERE m.cost > 0
  AND m.status <> 'cancelada'
  AND COALESCE(m.executed_date, m.scheduled_date) IS NOT NULL
ON CONFLICT (organization_id, reference_id, entry_type) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- FIM: aplicar_20270919000038_asset_maintenance_backfill_financeiro.sql
-- ────────────────────────────────────────────────────────────
