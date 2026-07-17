// __tests__/syncPlanner.test.ts
//
// O planner é função pura (origem + destino → plano), então dá para testá-lo sem banco.
// O caso que mais importa aqui é o `same`: antes, toda unidade com proveniência entrava na
// conta de "a atualizar" mesmo idêntica ao estudo — era a origem dos números inflados de
// divergência na tela do Centro de Sincronização.

import { describe, it, expect } from 'vitest';
import { buildPlan } from '../services/sync/planner';
import { classify } from '../services/sync/diff';
import { getFieldSpec } from '../services/sync/fieldRegistry';
import { CanonicalSide, CanonicalTower, CanonicalUnit, TargetState } from '../services/sync/types';
import {
    Empreendimento, EmpreendimentoTower, EmpreendimentoUnit,
} from '../types/empreendimento';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMP: Empreendimento = {
    id: 'emp-1', organization_id: 'org-1', name: 'Garden Teste', status: 'EM_OBRAS',
    imovib_study_id: 'study-1', planta_ai_study_id: 'plant-1',
    created_at: '2026-01-01', updated_at: '2026-01-01',
};

const tower = (over: Partial<EmpreendimentoTower> = {}): EmpreendimentoTower => ({
    id: 'tower-1', empreendimento_id: 'emp-1', name: 'Torre A',
    imovib_block_id: 'block-1',
    created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
});

const unit = (over: Partial<EmpreendimentoUnit> = {}): EmpreendimentoUnit => ({
    id: 'unit-1', tower_id: 'tower-1', name: 'Apto 101', status: 'DISPONIVEL',
    imovib_instance_id: 'inst-1',
    private_area: 62.4, floor: 1,
    created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
});

const cUnit = (fields: Record<string, unknown>, sourceId = 'inst-1'): CanonicalUnit =>
    ({ sourceId, fields, createOnly: {} });

const cTower = (units: CanonicalUnit[], fields: Record<string, unknown> = {}, sourceId = 'block-1'): CanonicalTower =>
    ({ sourceId, fields, createOnly: { imovib_block_id: sourceId, name: 'Torre A' }, units });

const side = (towers: CanonicalTower[]): CanonicalSide => ({
    origin: 'imovib', empreendimento: EMP, towers, commonAreaCandidates: [],
    liveTowerSourceIds: new Set(towers.map(t => t.sourceId)),
    liveUnitSourceIds: new Set(towers.flatMap(t => t.units.map(u => u.sourceId))),
    warnings: [],
});

const target = (over: Partial<TargetState> = {}): TargetState =>
    ({ towers: [tower()], units: [unit()], commonAreas: [], ...over });

// ── Os quatro baldes ─────────────────────────────────────────────────────────

describe('classify — os quatro baldes', () => {
    const areaSpec = getFieldSpec('imovib', 'unit', 'private_area')!;
    const nameSpec = getFieldSpec('imovib', 'unit', 'name')!;

    it('same: valores iguais', () => {
        expect(classify(62.4, 62.4, areaSpec)).toBe('same');
        expect(classify('Apto 101', 'Apto 101', nameSpec)).toBe('same');
    });

    it('fill: destino vazio', () => {
        expect(classify(null, 62.4, areaSpec)).toBe('fill');
        expect(classify(undefined, 'Apto 101', nameSpec)).toBe('fill');
        expect(classify('', 'Apto 101', nameSpec)).toBe('fill');
    });

    it('conflict: os dois preenchidos e diferentes', () => {
        expect(classify(62.4, 64.1, areaSpec)).toBe('conflict');
        expect(classify('Apto 101', 'Apto 102', nameSpec)).toBe('conflict');
    });

    it('same: origem vazia nunca propõe apagar o destino', () => {
        // Se a origem não sabe, ela não opina. Sem esta guarda, um campo que o estudo não
        // preenche viraria proposta de apagar o dado do Empreendimento.
        expect(classify(62.4, null, areaSpec)).toBe('same');
        expect(classify('Apto 101', undefined, nameSpec)).toBe('same');
    });

    it('tolerância de centavo absorve ruído de float, mas não diferença real', () => {
        expect(classify(25.87, 25.870000000000001, areaSpec)).toBe('same');
        expect(classify(25.87, 25.88, areaSpec)).toBe('same');      // exatamente 0.01
        expect(classify(25.87, 25.90, areaSpec)).toBe('conflict');  // 0.03 > 0.01
    });
});

// ── O bug que motivou a refatoração ──────────────────────────────────────────

describe('buildPlan — unidade idêntica não é "a atualizar"', () => {
    it('origem igual ao destino não gera mudança nenhuma', () => {
        const plan = buildPlan(
            side([cTower([cUnit({ name: 'Apto 101', floor: 1, private_area: 62.4 })], { name: 'Torre A' })]),
            target(),
        );
        expect(plan.fills).toHaveLength(0);
        expect(plan.conflicts).toHaveLength(0);
        expect(plan.towerCreates).toHaveLength(0);
        expect(plan.unitCreates).toHaveLength(0);
    });

    it('diferença real vira conflito com de→para', () => {
        const plan = buildPlan(
            side([cTower([cUnit({ private_area: 64.1 })], { name: 'Torre A' })]),
            target(),
        );
        expect(plan.conflicts).toHaveLength(1);
        expect(plan.conflicts[0]).toMatchObject({
            entity: 'unit', entityId: 'unit-1', field: 'private_area',
            from: 62.4, to: 64.1, kind: 'conflict', label: 'Área privativa', group: 'area',
        });
    });

    it('campo vazio no destino é fill, não conflito', () => {
        const plan = buildPlan(
            side([cTower([cUnit({ typology: 'Apto 2 dorm' })], { name: 'Torre A' })]),
            target({ units: [unit({ typology: undefined })] }),
        );
        expect(plan.conflicts).toHaveLength(0);
        expect(plan.fills).toHaveLength(1);
        expect(plan.fills[0]).toMatchObject({ field: 'typology', kind: 'fill', to: 'Apto 2 dorm' });
    });
});

// ── Criação ──────────────────────────────────────────────────────────────────

describe('buildPlan — criação', () => {
    it('torre sem proveniência no destino vira towerCreate com suas unidades', () => {
        const plan = buildPlan(
            side([cTower([cUnit({ name: 'Apto 201' })], { name: 'Torre B' }, 'block-novo')]),
            target({ towers: [], units: [] }),
        );
        expect(plan.towerCreates).toHaveLength(1);
        expect(plan.towerCreates[0].units).toHaveLength(1);
        expect(plan.conflicts).toHaveLength(0);
    });

    it('unidade nova em torre existente vira unitCreate', () => {
        const plan = buildPlan(
            side([cTower([cUnit({ name: 'Apto 102' }, 'inst-nova')], { name: 'Torre A' })]),
            target({ units: [] }),
        );
        expect(plan.unitCreates).toHaveLength(1);
        expect(plan.unitCreates[0].towerId).toBe('tower-1');
    });
});

// ── Órfãos ───────────────────────────────────────────────────────────────────

describe('buildPlan — órfãos', () => {
    it('proveniência que sumiu da origem é reportada, nunca deletada', () => {
        const plan = buildPlan(
            side([]),
            target({ towers: [tower()], units: [unit()] }),
        );
        expect(plan.orphanTowers.map(t => t.id)).toEqual(['tower-1']);
        expect(plan.orphanUnits.map(u => u.id)).toEqual(['unit-1']);
    });

    it('unidade criada à mão (sem proveniência) não é órfã', () => {
        const plan = buildPlan(
            side([]),
            target({ towers: [], units: [unit({ imovib_instance_id: undefined })] }),
        );
        expect(plan.orphanUnits).toHaveLength(0);
    });
});

// ── Estado comercial local ───────────────────────────────────────────────────

describe('buildPlan — proteção do estado comercial', () => {
    const vendida = () => unit({ status: 'VENDIDO', price: 500000 });
    const comPreco = [cTower([cUnit({ price: 480000, status: 'DISPONIVEL' })], { name: 'Torre A' })];

    it('preserva preço/status locais por padrão e reporta a unidade', () => {
        const plan = buildPlan(side(comPreco), target({ units: [vendida()] }));
        expect(plan.conflicts.filter(c => c.group === 'comercial')).toHaveLength(0);
        expect(plan.preservedUnitNames).toEqual(['Apto 101']);
    });

    it('overwriteCommercialState deixa o comercial divergir normalmente', () => {
        const plan = buildPlan(side(comPreco), target({ units: [vendida()] }), { overwriteCommercialState: true });
        const fields = plan.conflicts.filter(c => c.group === 'comercial').map(c => c.field).sort();
        expect(fields).toEqual(['price', 'status']);
        expect(plan.preservedUnitNames).toHaveLength(0);
    });

    it('não reporta "preservada" quando o comercial não divergia', () => {
        // Unidade vendida, mas o estudo propõe exatamente o mesmo preço/status: não há o que
        // proteger — acusar proteção aqui faria a tela mentir.
        const mesmo = [cTower([cUnit({ price: 500000, status: 'VENDIDO' })], { name: 'Torre A' })];
        const plan = buildPlan(side(mesmo), target({ units: [vendida()] }));
        expect(plan.preservedUnitNames).toHaveLength(0);
    });
});

// ── Determinismo: o preview é o apply ────────────────────────────────────────

describe('buildPlan — determinismo', () => {
    it('mesmos inputs geram o mesmo plano (o preview é o que o apply escreve)', () => {
        const s = side([cTower([cUnit({ private_area: 64.1 })], { name: 'Torre A' })]);
        const t = target();
        const a = buildPlan(s, t);
        const b = buildPlan(s, t);
        // builtAt é o único campo que varia por construção.
        expect({ ...a, builtAt: '' }).toEqual({ ...b, builtAt: '' });
    });
});
