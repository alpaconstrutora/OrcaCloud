// utils/assetMaintenanceFinance.ts
//
// Ponte Gestão de Ativos → Financeiro: uma manutenção com custo vira UM título
// em `internal_transactions` (DEBIT, pendente), com o centro de custo escolhido
// na manutenção. Sem isto o custo ficava só em `opura_asset_maintenances` e não
// entrava em Contas a Pagar, DRE nem ÒPURA · Relatórios (que lê apenas
// `vw_fact_financial_tx`). Ver docs/planos/2026-09-13-ativos-manutencao-financeiro.md.
//
// Este arquivo é puro (sem Supabase) para ser testável; a escrita mora em
// `assetService.syncMaintenanceFinance`.

import type { OpuraAssetMaintenance, MaintenanceType } from '../types';

export const ASSET_MAINTENANCE_SOURCE_SYSTEM = 'ASSET_MAINTENANCE';
export const ASSET_MAINTENANCE_CATEGORY = 'Manutenção de Ativos';

/** Um título por manutenção — chave do upsert em (organization_id, reference_id, entry_type). */
export function maintenanceTitleReference(maintenanceId: string): string {
  return `asset-maintenance-${maintenanceId}`;
}

const TIPO_LABEL: Record<MaintenanceType, string> = {
  preventiva: 'preventiva',
  corretiva: 'corretiva',
  calibracao: 'calibração',
};

export interface MaintenanceTitleAsset {
  code?: string | null;
  name?: string | null;
  current_project_id?: string | null;
}

/** Linha pronta para `internal_transactions.upsert` (subset das colunas). */
export interface MaintenanceTitleRow {
  organization_id: string;
  source_system: string;
  reference_id: string;
  entry_type: 'PRINCIPAL';
  transaction_date: string;
  due_date: string;
  amount: number;
  direction: 'DEBIT';
  description: string;
  category: string;
  status: 'PENDING';
  business_status: 'PREVISTO';
  cost_center_id: string | null;
  project_id: string | null;
}

/**
 * Monta o título de uma manutenção, ou `null` quando ela não deve ter título
 * (custo zero/negativo ou cancelada). `null` com título existente = cancelar.
 *
 * Datas: a de execução quando já concluiu; senão a agendada — o título nasce
 * na criação da ordem (decisão do usuário em 2026-09-13) com o custo estimado
 * e é ajustado ao concluir.
 */
export function buildMaintenanceTitle(
  maint: Pick<OpuraAssetMaintenance, 'id' | 'organization_id' | 'type' | 'description' | 'status' | 'scheduled_date' | 'executed_date' | 'cost' | 'cost_center_id'>,
  asset: MaintenanceTitleAsset | null | undefined,
): MaintenanceTitleRow | null {
  const amount = Number(maint.cost) || 0;
  if (amount <= 0) return null;
  if (maint.status === 'cancelada') return null;

  const date = (maint.executed_date || maint.scheduled_date || '').slice(0, 10);
  if (!date) return null;

  const ativo = [asset?.code, asset?.name].filter(Boolean).join(' ').trim();
  const descricao = (maint.description || '').trim();
  const description = (
    `Manutenção ${TIPO_LABEL[maint.type] ?? maint.type}`
    + (ativo ? ` — ${ativo}` : '')
    + (descricao ? `: ${descricao}` : '')
  ).replace(/\s+/g, ' ').trim();

  return {
    organization_id: maint.organization_id,
    source_system: ASSET_MAINTENANCE_SOURCE_SYSTEM,
    reference_id: maintenanceTitleReference(maint.id),
    entry_type: 'PRINCIPAL',
    transaction_date: date,
    due_date: date,
    amount,
    direction: 'DEBIT',
    description,
    category: ASSET_MAINTENANCE_CATEGORY,
    status: 'PENDING',
    business_status: 'PREVISTO',
    cost_center_id: maint.cost_center_id ?? null,
    project_id: asset?.current_project_id ?? null,
  };
}
