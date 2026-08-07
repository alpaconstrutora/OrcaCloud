import { describe, it, expect } from 'vitest';
import {
    allocateDirect,
    allocateProrated,
    allocationsBalance,
    type AllocationTarget,
} from '../lib/rentalAllocation';

const sum = (values: { amount: number }[]): number =>
    Math.round(values.reduce((s, v) => s + v.amount, 0) * 100) / 100;

describe('allocateDirect', () => {
    it('joga o valor inteiro numa parcela só', () => {
        const { allocations } = allocateDirect('ed-1', 1_250.75);

        expect(allocations).toEqual([
            { property_id: 'ed-1', amount: 1_250.75, basis: 'DIRECT' },
        ]);
    });
});

describe('allocateProrated — o invariante da soma', () => {
    const units: AllocationTarget[] = [
        { id: 'u1', private_area: 50 },
        { id: 'u2', private_area: 100 },
        { id: 'u3', private_area: 50 },
    ];

    it('divide proporcional à área privativa', () => {
        const { allocations } = allocateProrated(units, 2_000);

        expect(allocations.map(a => a.amount)).toEqual([500, 1_000, 500]);
        expect(allocations[1].basis).toBe('PRIVATE_AREA');
        expect(allocations[1].basis_value).toBe(100);
    });

    it('fecha exatamente mesmo com dízima — o resto não some', () => {
        // 100 / 3 = 33,333... Sem distribuir o resto, a soma daria 99,99 e o
        // NOI perderia um centavo por lançamento, para sempre.
        const iguais: AllocationTarget[] = [
            { id: 'a', private_area: 10 },
            { id: 'b', private_area: 10 },
            { id: 'c', private_area: 10 },
        ];
        const { allocations } = allocateProrated(iguais, 100);

        expect(sum(allocations)).toBe(100);
        expect(allocations.map(a => a.amount).sort()).toEqual([33.33, 33.33, 33.34]);
    });

    it('fecha em valores quebrados com muitas unidades', () => {
        const muitas: AllocationTarget[] = Array.from({ length: 37 }, (_, i) => ({
            id: `u${i}`,
            private_area: 30 + (i % 7),
        }));
        const { allocations } = allocateProrated(muitas, 9_876.54);

        expect(sum(allocations)).toBe(9_876.54);
        expect(allocationsBalance(allocations, 9_876.54)).toBe(true);
    });

    it('nunca gera parcela negativa', () => {
        const { allocations } = allocateProrated(units, 0.01);

        expect(allocations.every(a => a.amount >= 0)).toBe(true);
        expect(sum(allocations)).toBe(0.01);
    });

    it('cai para divisão igual quando NENHUMA unidade tem área — e sinaliza', () => {
        // Dividir igual entre quitinete e cobertura é uma decisão, não detalhe
        // técnico: a tela precisa avisar que ela foi tomada pelo usuário.
        const semArea: AllocationTarget[] = [
            { id: 'a', private_area: null },
            { id: 'b', private_area: 0 },
        ];
        const { allocations, fellBackToEqual } = allocateProrated(semArea, 300);

        expect(fellBackToEqual).toBe(true);
        expect(allocations.map(a => a.amount)).toEqual([150, 150]);
        expect(allocations[0].basis).toBe('EQUAL');
    });

    it('usa `area` quando `private_area` não existe', () => {
        const comFallback: AllocationTarget[] = [
            { id: 'a', area: 30 },
            { id: 'b', area: 10 },
        ];
        const { allocations, fellBackToEqual } = allocateProrated(comFallback, 400);

        expect(fellBackToEqual).toBe(false);
        expect(allocations.map(a => a.amount)).toEqual([300, 100]);
    });

    it('unidade sem área no meio de unidades com área não recebe nada', () => {
        // Correto: ratear por área e dar parcela a quem tem área zero seria
        // inventar um critério que ninguém pediu.
        const misto: AllocationTarget[] = [
            { id: 'com', private_area: 100 },
            { id: 'sem', private_area: null },
        ];
        const { allocations } = allocateProrated(misto, 500);

        expect(allocations.find(a => a.property_id === 'sem')?.amount).toBe(0);
        expect(sum(allocations)).toBe(500);
    });

    it('lista vazia de unidades não quebra nem inventa parcela', () => {
        const { allocations } = allocateProrated([], 1_000);
        expect(allocations).toEqual([]);
    });

    it('não erra por float: 0.1 + 0.2 não pode virar 0.30000000000000004', () => {
        const dois: AllocationTarget[] = [
            { id: 'a', private_area: 1 },
            { id: 'b', private_area: 2 },
        ];
        const { allocations } = allocateProrated(dois, 0.3);

        expect(sum(allocations)).toBe(0.3);
        expect(allocationsBalance(allocations, 0.3)).toBe(true);
    });
});

describe('allocationsBalance — o portão antes de salvar', () => {
    it('aceita o que fecha', () => {
        expect(allocationsBalance(
            [{ property_id: 'a', amount: 33.33, basis: 'DIRECT' },
             { property_id: 'b', amount: 66.67, basis: 'DIRECT' }],
            100
        )).toBe(true);
    });

    it('recusa diferença de um centavo', () => {
        expect(allocationsBalance(
            [{ property_id: 'a', amount: 99.99, basis: 'DIRECT' }],
            100
        )).toBe(false);
    });
});
