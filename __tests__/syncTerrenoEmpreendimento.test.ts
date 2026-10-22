// __tests__/syncTerrenoEmpreendimento.test.ts
//
// O terreno da Planta no motor de sincronização (plano docs/planos/2026-10-22-planta-empreendimento-pendencias.md,
// item 5): campos do PRÓPRIO empreendimento (entidade 'empreendimento') com as regras de sempre — vazio
// preenche, divergente vai à Curadoria, igual some. Sem torres no lado, nada vira órfão.

import { describe, it, expect } from 'vitest';
import { buildPlan, changesToUpdates } from '../services/sync/planner';
import type { CanonicalSide, TargetState } from '../services/sync/types';
import type { Empreendimento, EmpreendimentoTower } from '../types/empreendimento';

const GARDEN = {
    id: 'emp-1', organization_id: 'org-1', name: '011 - Garden Cambuhy', status: 'EM_OBRAS',
    blueprint_study_id: 'planta-1', created_at: '2026-01-01', updated_at: '2026-01-01',
    terreno_tipo: 'Irregular (Geometria complexa)', terreno_area: 1229, terreno_frente: 18, terreno_fundos: 11, terreno_profundidade: undefined,
} as unknown as Empreendimento;

const lado = (campos: Record<string, unknown>): CanonicalSide => ({
    origin: 'blueprint', empreendimento: GARDEN, towers: [], commonAreaCandidates: [],
    liveTowerSourceIds: new Set(), liveUnitSourceIds: new Set(), warnings: [], empreendimentoFields: campos,
});
const VAZIO: TargetState = { towers: [], units: [], commonAreas: [] };

describe('sincronização do terreno (entidade empreendimento)', () => {
    it('vazio preenche, diferente vai à Curadoria, igual (± 1 cm) some; a Planta sem valor não propõe apagar', () => {
        const plan = buildPlan(lado({
            terreno_tipo: 'Irregular (Geometria complexa)', // igual
            terreno_area: 1229.004,                        // igual dentro da tolerância
            terreno_frente: 18,                            // igual
            terreno_fundos: 12,                            // diferente → Curadoria
            terreno_profundidade: 71,                      // ficha vazia → preenche
            terreno_lateral_direita: null,                 // Planta sem valor → nada
        }), VAZIO);
        expect(plan.fills.map((c) => [c.entity, c.entityId, c.field, c.to])).toEqual([['empreendimento', 'emp-1', 'terreno_profundidade', 71]]);
        expect(plan.conflicts.map((c) => [c.field, c.from, c.to])).toEqual([['terreno_fundos', 11, 12]]);
        expect(plan.conflicts[0]).toMatchObject({ label: 'Fundos do terreno (m)', group: 'area', origin: 'blueprint', sourceRef: { blueprint_study_id: 'planta-1' } });
        expect(plan.orphanTowers).toEqual([]);
    });

    it('o fill vira update da tabela de empreendimentos', () => {
        const plan = buildPlan(lado({ terreno_profundidade: 71, terreno_lateral_esquerda: 72 }), VAZIO);
        expect([...changesToUpdates(plan.fills).entries()]).toEqual([['emp-1', { entity: 'empreendimento', fields: { terreno_profundidade: 71, terreno_lateral_esquerda: 72 } }]]);
    });

    it('lado do loteamento (sem empreendimentoFields) não propõe nada do terreno', () => {
        const torre = { id: 't1', empreendimento_id: 'emp-1', name: 'Quadra A', blueprint_quadra_uid: 'q1', created_at: '', updated_at: '' } as EmpreendimentoTower;
        const plan = buildPlan({ ...lado({}), empreendimentoFields: undefined, liveTowerSourceIds: new Set(['q1']) }, { ...VAZIO, towers: [torre] });
        expect([...plan.fills, ...plan.conflicts].filter((c) => c.entity === 'empreendimento')).toEqual([]);
    });
});
