import { describe, expect, it } from 'vitest';
import { cloneBudgetForPersistence, cloneSettingsForPersistence } from '../utils/budgetPersistence';
import { BudgetEntry, ProjectSettings, SinapiType } from '../types';

const technicalEntry: BudgetEntry = {
  id: 'item-1',
  quantity: 12.5,
  group: '01. Serviços preliminares',
  phase: '01.01. Canteiro',
  subPhase: '01.01.01. Implantação',
  sinapiItem: {
    code: 'CPU-001',
    description: 'Barracão de obra com memória técnica',
    unit: 'm2',
    price: 150,
    type: SinapiType.COMPOSITION,
    category: 'Serviços',
  },
  costCenterId: 'cc-obra',
  discipline: 'Arquitetura',
  location: { block: 'B1', tower: 'Torre A', floor: '2', room: '201' },
  responsible: 'Engenharia',
  status: 'Aprovado',
  notes: 'Conferido com projeto executivo.',
  attachments: [{ name: 'memoria.pdf', url: 'https://example.test/memoria.pdf', type: 'application/pdf', uploadedAt: '2026-07-10T00:00:00.000Z' }],
  precisionClass: 'B',
  calculationMemory: {
    formula: 'comprimento * largura',
    variables: { comprimento: 5, largura: 2.5, fonte: 'Projeto executivo' },
    result: 12.5,
    justification: 'Quantidade medida em planta.',
    approved: true,
    approvedBy: 'Coordenação',
    approvedAt: '2026-07-10T00:00:00.000Z',
  },
};

describe('budgetPersistence', () => {
  it('preserva metadados técnicos no orçamento principal', () => {
    const cloned = cloneBudgetForPersistence([technicalEntry]);

    expect(cloned).toEqual([technicalEntry]);
    expect(cloned[0]).not.toBe(technicalEntry);
    expect(cloned[0].calculationMemory).toEqual(technicalEntry.calculationMemory);
    expect(cloned[0].attachments).toEqual(technicalEntry.attachments);
  });

  it('preserva metadados técnicos em versões e snapshots de planejamento', () => {
    const settings: ProjectSettings = {
      id: 'project-1',
      name: 'Orçamento técnico',
      location: 'MG',
      standard: 'Normal',
      cubRate: 0,
      area: 0,
      bdi: 10,
      ls: 0,
      database: 'SINAPI',
      referenceMonth: '12/2025',
      socialChargesMode: 'SEM_DESONERACAO',
      wbs: [],
      activeVersionId: 'version-1',
      versions: [{
        id: 'version-1',
        item: 1,
        date: '2026-07-10T00:00:00.000Z',
        description: 'Base aprovada',
        budget: [technicalEntry],
        settings: {},
      }],
      basedOnBudgetSnapshot: [technicalEntry],
    };

    const cloned = cloneSettingsForPersistence(settings);

    expect(cloned.versions?.[0].budget[0].calculationMemory).toEqual(technicalEntry.calculationMemory);
    expect(cloned.versions?.[0].budget[0].precisionClass).toBe('B');
    expect(cloned.basedOnBudgetSnapshot?.[0].location).toEqual(technicalEntry.location);
    expect(cloned.versions?.[0].budget[0]).not.toBe(technicalEntry);
  });
});
