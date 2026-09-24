import { describe, it, expect } from 'vitest';
import { buildMaintenanceTitle, maintenanceTitleReference } from '../utils/assetMaintenanceFinance';

const base = {
  id: 'db979505-2f48-4660-90c6-8aa486c8a3ef',
  organization_id: '926cf626-ba49-4ee4-9f35-472822fb90e6',
  type: 'corretiva' as const,
  description: 'Troca de rolamentos',
  status: 'concluida' as const,
  scheduled_date: '2026-09-11',
  executed_date: '2026-09-12',
  cost: 360,
  cost_center_id: '0fa9cb7f-9255-43b9-ac20-d283d5630283',
};
const asset = { code: 'AT-001', name: 'Betoneira 400L', current_project_id: 'obra-1' };

describe('buildMaintenanceTitle', () => {
  it('manutenção concluída com custo vira título DEBIT pendente no centro de custo dela', () => {
    const row = buildMaintenanceTitle(base, asset);
    expect(row).not.toBeNull();
    expect(row!).toMatchObject({
      organization_id: base.organization_id,
      source_system: 'ASSET_MAINTENANCE',
      reference_id: `asset-maintenance-${base.id}`,
      entry_type: 'PRINCIPAL',
      direction: 'DEBIT',
      status: 'PENDING',
      business_status: 'PREVISTO',
      amount: 360,
      cost_center_id: base.cost_center_id,
      project_id: 'obra-1',
      category: 'Manutenção de Ativos',
    });
  });

  it('concluída usa a data de execução; agendada usa a data agendada', () => {
    expect(buildMaintenanceTitle(base, asset)!.due_date).toBe('2026-09-12');
    const agendada = buildMaintenanceTitle({ ...base, status: 'agendada', executed_date: undefined }, asset)!;
    expect(agendada.transaction_date).toBe('2026-09-11');
    expect(agendada.due_date).toBe('2026-09-11');
  });

  it('descrição junta tipo, ativo e texto da ordem', () => {
    expect(buildMaintenanceTitle(base, asset)!.description)
      .toBe('Manutenção corretiva — AT-001 Betoneira 400L: Troca de rolamentos');
    expect(buildMaintenanceTitle({ ...base, type: 'preditiva', description: '' }, null)!.description)
      .toBe('Manutenção preditiva');
  });

  it('custo zero ou negativo → sem título', () => {
    expect(buildMaintenanceTitle({ ...base, cost: 0 }, asset)).toBeNull();
    expect(buildMaintenanceTitle({ ...base, cost: -5 }, asset)).toBeNull();
    expect(buildMaintenanceTitle({ ...base, cost: Number.NaN }, asset)).toBeNull();
  });

  it('cancelada → sem título (o serviço cancela o existente)', () => {
    expect(buildMaintenanceTitle({ ...base, status: 'cancelada' }, asset)).toBeNull();
  });

  it('sem centro de custo e sem ativo ainda gera título (campos nulos)', () => {
    const row = buildMaintenanceTitle({ ...base, cost_center_id: null }, undefined)!;
    expect(row.cost_center_id).toBeNull();
    expect(row.project_id).toBeNull();
  });

  it('reference_id é estável por manutenção', () => {
    expect(maintenanceTitleReference('abc')).toBe('asset-maintenance-abc');
  });
});
