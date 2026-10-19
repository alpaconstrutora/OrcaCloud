import { describe, it, expect } from 'vitest';
import { derivarEstruturaDoEmpreendimento, blocoSemLinha, SEM_TIPOLOGIA } from '../utils/imovibEstrutura';
import { computeImovibMath } from '../hooks/useImovibMath';
import type { ImovibBlock } from '../types/imovib';

/**
 * A estrutura do estudo lida do Empreendimento (plano 2026-10-19-imovib-premissas-
 * planta-inteligente.md, Fase 2). O formato tem de ser o que o motor já lê: o teste
 * de ponta é o VGV/custo do motor bater com a soma das unidades do cadastro.
 */

const blocoDoEstudo = (over: Partial<ImovibBlock> = {}): ImovibBlock => ({
    id: 'bloco-a', study_id: 'estudo', name: 'Torre A',
    construction_cost_sqm: 3000, sales_price_sqm: 8000, units: [], ...over,
});

// Formato do Garden Cambuhy (19/10/2026): Torre A ligada ao bloco do estudo, Torre B sem bloco.
const torres = [
    { id: 't-b', name: 'Torre B', imovib_block_id: null, sort_order: 2 },
    { id: 't-a', name: 'Torre A', imovib_block_id: 'bloco-a', sort_order: 1 },
];
const unidades = [
    { tower_id: 't-a', typology: 'Tipo 1', private_area: 80, common_area: 5, is_vendavel: true },
    { tower_id: 't-a', typology: 'Tipo 1', private_area: 90, common_area: 5, is_vendavel: true },
    { tower_id: 't-a', typology: null, private_area: 50, common_area: 0, is_vendavel: true },
    { tower_id: 't-b', typology: 'Tipo 5', private_area: 100, common_area: 0, is_vendavel: true },
    { tower_id: 't-b', typology: 'Tipo 5', private_area: 100, common_area: 0, is_vendavel: false },
];

describe('derivarEstruturaDoEmpreendimento', () => {
    it('uma torre = um bloco, na ordem do cadastro; o bloco ligado mantém o id (espelho e custo)', () => {
        const r = derivarEstruturaDoEmpreendimento('estudo', torres, unidades, [blocoDoEstudo()]);
        expect(r.blocos.map(b => b.name)).toEqual(['Torre A', 'Torre B']);
        expect(r.blocos[0].id).toBe('bloco-a');
        expect(blocoSemLinha(r.blocos[0])).toBe(false);
        expect(blocoSemLinha(r.blocos[1])).toBe(true);
        expect(r.blocos[1].tower_id).toBe('t-b');
        expect(r.unidades).toBe(5);
    });

    it('tipologia = unidades agrupadas por (nome, vendável); total × média = soma exata', () => {
        const r = derivarEstruturaDoEmpreendimento('estudo', torres, unidades, [blocoDoEstudo()]);
        const a = r.blocos[0].units!;
        expect(a.map(t => t.name)).toEqual(['Sem tipologia', 'Tipo 1'].sort((x, y) => x.localeCompare(y, 'pt-BR')));
        const tipo1 = a.find(t => t.name === 'Tipo 1')!;
        expect(tipo1.quantity).toBe(2);
        expect(tipo1.pavimentos).toBe(1);
        expect(tipo1.quantity * tipo1.private_area).toBe(170);
        expect(a.find(t => t.name === SEM_TIPOLOGIA)!.quantity).toBe(1);
        // Mesma tipologia, vendável e não vendável, NÃO se misturam (só a vendável vai ao VGV).
        const b = r.blocos[1].units!;
        expect(b).toHaveLength(2);
        expect(b.filter(t => t.is_vendavel === false)).toHaveLength(1);
    });

    it('custo/preço: o do estudo vale; sem ele, o da torre; sem ela, preço das unidades ÷ área', () => {
        const comTorre = derivarEstruturaDoEmpreendimento('estudo',
            [{ id: 't-a', name: 'Torre A', imovib_block_id: 'bloco-a', construction_cost_sqm: 2500, sales_price_sqm: 7000 }],
            [], [blocoDoEstudo({ construction_cost_sqm: 0 })]);
        expect(comTorre.blocos[0].sales_price_sqm).toBe(8000);      // digitado no estudo, não é sobrescrito
        expect(comTorre.blocos[0].construction_cost_sqm).toBe(2500); // vazio no estudo → o da torre

        const pelasUnidades = derivarEstruturaDoEmpreendimento('estudo',
            [{ id: 't-b', name: 'Torre B' }],
            [
                { tower_id: 't-b', private_area: 100, price: 900_000 },
                { tower_id: 't-b', private_area: 50, price: 600_000 },
                { tower_id: 't-b', private_area: 70, price: 0 },                       // sem preço: fora da média
                { tower_id: 't-b', private_area: 40, price: 999_999, is_vendavel: false }, // não vendável: fora
            ], []);
        expect(pelasUnidades.blocos[0].sales_price_sqm).toBe(10000);
        expect(pelasUnidades.blocos[0].construction_cost_sqm).toBe(0);
    });

    it('vínculo para bloco apagado conta como torre sem bloco; bloco que ninguém reivindica fica fora', () => {
        const r = derivarEstruturaDoEmpreendimento('estudo',
            [{ id: 't-a', name: 'Torre A', imovib_block_id: 'apagado' }], [],
            [blocoDoEstudo({ id: 'bloco-velho', name: 'Bloco Único (Planta AI)' })]);
        expect(blocoSemLinha(r.blocos[0])).toBe(true);
        expect(r.blocosForaDoCalculo.map(b => b.name)).toEqual(['Bloco Único (Planta AI)']);
    });

    it('empreendimento sem torres: estrutura vazia, sem inventar bloco', () => {
        const r = derivarEstruturaDoEmpreendimento('estudo', [], [], [blocoDoEstudo()]);
        expect(r.blocos).toEqual([]);
        expect(r.blocosForaDoCalculo).toHaveLength(1);
    });

    it('o motor lê a estrutura derivada: área e VGV batem com a soma das unidades', () => {
        const r = derivarEstruturaDoEmpreendimento('estudo', torres, unidades, [blocoDoEstudo()]);
        const m = computeImovibMath({
            id: 'estudo', name: 'x', blocks: r.blocos, unit_instances: [], capex_mode: 'detailed',
        } as any);
        // Torre A: 220 m² privativos + 10 comuns; Torre B: 200 privativos (100 vendáveis).
        expect(m.totalPrivateArea).toBe(420);
        expect(m.totalBlockArea).toBe(430);
        // VGV: só Torre A tem preço (8000/m² × 220 vendáveis); Torre B sem preço = 0.
        expect(m.vgvPorBloco['bloco-a'].vgv).toBe(220 * 8000);
        expect(m.vgvPorBloco[r.blocos[1].id].vgv).toBe(0);
    });
});
