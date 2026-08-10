import { describe, it, expect } from 'vitest';
import {
    financialOccupancy,
    collectionSnapshot,
    wale,
    renewalRate,
    parseDateBR,
    diffDays,
} from '../lib/rentalExecutive';

const D = (iso: string) => parseDateBR(iso);
const HOJE = D('2026-08-10');

describe('parseDateBR — bug de fuso', () => {
    it('nao volta um dia (o erro classico de new Date("YYYY-MM-DD"))', () => {
        const d = parseDateBR('2026-08-10');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(7);   // agosto
        expect(d.getDate()).toBe(10);
    });

    it('ignora hora quando a string ja vem com timestamp', () => {
        expect(parseDateBR('2026-08-10T23:59:59Z').getDate()).toBe(10);
    });
});

describe('financialOccupancy', () => {
    it('mede receita contratada sobre a potencial', () => {
        const r = financialOccupancy([
            { id: 'a', rental_price: 1000, contracted: 1000 },
            { id: 'b', rental_price: 1000, contracted: 0 },
        ]);
        expect(r.potential).toBe(2000);
        expect(r.contracted).toBe(1000);
        expect(r.rate).toBe(0.5);
    });

    it('distingue ocupacao FISICA de FINANCEIRA — o caso que motiva o indicador', () => {
        // 2 de 3 unidades alugadas = 66,7% fisica. Mas a vazia e a cara:
        const r = financialOccupancy([
            { id: 'barata1', rental_price: 500, contracted: 500 },
            { id: 'barata2', rental_price: 500, contracted: 500 },
            { id: 'cara', rental_price: 4000, contracted: 0 },
        ]);
        expect(r.rate).toBeCloseTo(0.2, 5);   // 1000/5000 — bem abaixo dos 66,7%
    });

    it('unidade sem preco de tabela nao entra no potencial', () => {
        const r = financialOccupancy([
            { id: 'a', rental_price: 1000, contracted: 1000 },
            { id: 'sem_preco', rental_price: null, contracted: 0 },
        ]);
        expect(r.potential).toBe(1000);
        expect(r.rate).toBe(1);
    });

    it('contratado acima da tabela nao passa de 100%', () => {
        // Aluguel reajustado acima do preco de tabela desatualizado.
        const r = financialOccupancy([{ id: 'a', rental_price: 800, contracted: 1000 }]);
        expect(r.potential).toBe(1000);
        expect(r.rate).toBe(1);
    });

    it('carteira sem preco nenhum devolve null, nao zero', () => {
        expect(financialOccupancy([{ id: 'a' }]).rate).toBeNull();
    });

    it('lista vazia devolve null', () => {
        expect(financialOccupancy([]).rate).toBeNull();
    });
});

describe('collectionSnapshot', () => {
    it('separa lancado de recebido', () => {
        const r = collectionSnapshot([
            { amount: 1000, due_date: '2026-08-01', settled: true },
            { amount: 1000, due_date: '2026-08-01', settled: false },
        ], HOJE);
        expect(r.billed).toBe(2000);
        expect(r.received).toBe(1000);
        expect(r.collectionRate).toBe(0.5);
    });

    it('classifica atraso nas faixas certas, sem dupla contagem', () => {
        const r = collectionSnapshot([
            { amount: 10, due_date: '2026-07-25', settled: false },  // 16d  -> nenhuma
            { amount: 20, due_date: '2026-07-01', settled: false },  // 40d  -> 30
            { amount: 40, due_date: '2026-06-01', settled: false },  // 70d  -> 60
            { amount: 80, due_date: '2026-01-01', settled: false },  // 221d -> 90
        ], HOJE);
        expect(r.overdue30).toBe(20);
        expect(r.overdue60).toBe(40);
        expect(r.overdue90).toBe(80);
    });

    it('vencido mas ja recebido NAO conta como atraso', () => {
        const r = collectionSnapshot([
            { amount: 500, due_date: '2020-01-01', settled: true },
        ], HOJE);
        expect(r.overdue90).toBe(0);
        expect(r.received).toBe(500);
    });

    it('parcela sem vencimento conta no lancado e em faixa nenhuma', () => {
        const r = collectionSnapshot([{ amount: 300, settled: false }], HOJE);
        expect(r.billed).toBe(300);
        expect(r.overdue30 + r.overdue60 + r.overdue90).toBe(0);
    });

    it('exatamente 90 dias ainda NAO e "+90"', () => {
        const noventa = new Date(HOJE.getTime() - 90 * 86400000);
        const iso = noventa.toISOString().slice(0, 10);
        const r = collectionSnapshot([{ amount: 100, due_date: iso, settled: false }], HOJE);
        expect(r.overdue90).toBe(0);
        expect(r.overdue60).toBe(100);
    });

    it('sem lancamento devolve null, nao zero', () => {
        const r = collectionSnapshot([], HOJE);
        expect(r.collectionRate).toBeNull();
        expect(r.overdue90Rate).toBeNull();
    });
});

describe('wale', () => {
    it('pondera por valor — contrato grande pesa mais', () => {
        const r = wale([
            { id: 'a', end_date: '2027-08-10', value: 9000, active: true },  // 1 ano
            { id: 'b', end_date: '2031-08-10', value: 1000, active: true },  // 5 anos
        ], HOJE);
        // ponderado = (1*9000 + 5*1000)/10000 = 1,4 — puxado para o contrato caro
        expect(r.years).toBeCloseTo(1.4, 1);
        expect(r.simpleYears).toBeCloseTo(3.0, 1);  // media simples diria 3
        expect(r.counted).toBe(2);
    });

    it('contrato ATIVO ja vencido fica FORA e e reportado', () => {
        const r = wale([
            { id: 'ok', end_date: '2028-08-10', value: 1000, active: true },
            { id: 'vencido', end_date: '2025-05-25', value: 4346, active: true },
        ], HOJE);
        expect(r.counted).toBe(1);
        expect(r.expiredStillActive).toBe(1);
        expect(r.years).toBeCloseTo(2.0, 1);   // nao foi arrastado para baixo
    });

    it('contrato inativo nao entra nem como vencido', () => {
        const r = wale([{ id: 'x', end_date: '2020-01-01', value: 100, active: false }], HOJE);
        expect(r.counted).toBe(0);
        expect(r.expiredStillActive).toBe(0);
        expect(r.years).toBeNull();
    });

    it('sem end_date e contado a parte', () => {
        const r = wale([{ id: 'x', value: 100, active: true }], HOJE);
        expect(r.missingEndDate).toBe(1);
        expect(r.years).toBeNull();
    });

    it('sem valor em contrato nenhum cai para media simples, nao para zero', () => {
        const r = wale([
            { id: 'a', end_date: '2027-08-10', active: true },
            { id: 'b', end_date: '2029-08-10', active: true },
        ], HOJE);
        expect(r.years).toBeCloseTo(2.0, 1);
        expect(r.years).toBe(r.simpleYears);
    });

    it('carteira vazia devolve null', () => {
        expect(wale([], HOJE).years).toBeNull();
    });
});

describe('renewalRate', () => {
    const JAN = D('2026-01-01');
    const DEZ = D('2026-12-31');

    it('conta como renovado quem tem contrato-FILHO apontando', () => {
        const r = renewalRate([
            { id: 'pai', end_date: '2026-06-30' },
            { id: 'filho', end_date: '2029-06-30', parent_contract_id: 'pai', renewal_seq: 1 },
        ], JAN, DEZ);
        expect(r.expired).toBe(1);
        expect(r.renewed).toBe(1);
        expect(r.rate).toBe(1);
    });

    it('vencido sem filho nao renovou', () => {
        const r = renewalRate([{ id: 'pai', end_date: '2026-06-30' }], JAN, DEZ);
        expect(r.rate).toBe(0);
    });

    it('renewal_seq do proprio contrato NAO significa que ele foi renovado', () => {
        // Ele E uma renovacao; isso nao diz nada sobre o futuro dele.
        const r = renewalRate([
            { id: 'x', end_date: '2026-06-30', renewal_seq: 2 },
        ], JAN, DEZ);
        expect(r.renewed).toBe(0);
    });

    it('so conta o que vence DENTRO da janela', () => {
        const r = renewalRate([
            { id: 'antes', end_date: '2025-06-30' },
            { id: 'depois', end_date: '2027-06-30' },
        ], JAN, DEZ);
        expect(r.expired).toBe(0);
        expect(r.rate).toBeNull();
    });

    it('nada vencido devolve null — nao e 0%', () => {
        const r = renewalRate([{ id: 'a', end_date: '2030-01-01' }], JAN, DEZ);
        expect(r.rate).toBeNull();
    });
});

describe('diffDays', () => {
    it('conta dias entre datas', () => {
        expect(diffDays(D('2026-08-01'), D('2026-08-10'))).toBe(9);
    });
    it('devolve negativo quando a segunda data e anterior', () => {
        expect(diffDays(D('2026-08-10'), D('2026-08-01'))).toBe(-9);
    });
});
