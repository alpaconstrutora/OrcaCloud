import { describe, it, expect } from 'vitest';
import { recebimentoPorSafra, PerfilDeRecebimento, PremissasDeDistrato, SerieDeRecebimento } from '../utils/imovibRecebimento';

/** Recebimento por safra (item 1.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const total = (s: SerieDeRecebimento) =>
    sum(s.sinal) + sum(s.parcelasObra) + sum(s.intermediarias) + sum(s.repasse) + sum(s.posChaves) + sum(s.devolucaoDistrato);
/** Vendas por mês com uma venda de `valor` no mês `mes` (1 = primeiro mês). */
const venda = (mes: number, valor: number, n = 24) => Array.from({ length: n }, (_, i) => (i === mes - 1 ? valor : 0));
const mes = (serie: number[], m: number) => serie[m - 1] ?? 0;

const PERFIL: PerfilDeRecebimento = {
    sinalPct: 10, parcelasObraPct: 20, intermediariasPct: 10, intermediariasIntervalo: 6,
    repassePct: 50, atrasoDoRepasse: 0, posChavesPct: 10, posChavesMeses: 12, posChavesJurosMensal: 0,
};
const SEM_DISTRATO: PremissasDeDistrato = { taxaPct: 0, defasagemMeses: 12, devolucaoPct: 75, revende: true, desagioRevendaPct: 0 };

describe('1.2 — recebimentoPorSafra', () => {
    it('uma venda de 1.000.000 no mês 3, chaves no mês 12, perfil 10/20/10/50/10', () => {
        const s = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, SEM_DISTRATO, 24);
        expect(mes(s.sinal, 3)).toBeCloseTo(100_000, 6);
        for (let m = 4; m <= 12; m++) expect(mes(s.parcelasObra, m)).toBeCloseTo(200_000 / 9, 6);
        expect(mes(s.parcelasObra, 3)).toBe(0);
        expect(mes(s.intermediarias, 9)).toBeCloseTo(100_000, 6);
        expect(sum(s.intermediarias)).toBeCloseTo(100_000, 6);
        expect(mes(s.repasse, 12)).toBeCloseTo(500_000, 6);
        for (let m = 13; m <= 24; m++) expect(mes(s.posChaves, m)).toBeCloseTo(100_000 / 12, 6);
        expect(sum(s.posChaves)).toBeCloseTo(100_000, 6);
        expect(total(s)).toBeCloseTo(1_000_000, 6);
    });

    it('conservação: sem juro e sem distrato, recebe exatamente o vendido vezes a soma dos percentuais', () => {
        const vendas = [0, 300_000, 150_000, 0, 500_000, 120_000, 80_000, 0, 0, 40_000];
        const s = recebimentoPorSafra(vendas, PERFIL, 8, SEM_DISTRATO, 10);
        expect(total(s)).toBeCloseTo(sum(vendas), 4);
        const parcial = { ...PERFIL, repassePct: 40 }; // perfil somando 90%
        expect(total(recebimentoPorSafra(vendas, parcial, 8, SEM_DISTRATO, 10))).toBeCloseTo(0.9 * sum(vendas), 4);
    });

    it('venda depois das chaves: sinal, parcelas e intermediárias no mês da venda; repasse também', () => {
        const s = recebimentoPorSafra(venda(15, 1_000_000), PERFIL, 12, SEM_DISTRATO, 24);
        expect(mes(s.sinal, 15)).toBeCloseTo(100_000, 6);
        expect(mes(s.parcelasObra, 15)).toBeCloseTo(200_000, 6);
        expect(mes(s.intermediarias, 15)).toBeCloseTo(100_000, 6);
        expect(mes(s.repasse, 15)).toBeCloseTo(500_000, 6);
        expect(mes(s.posChaves, 16)).toBeCloseTo(100_000 / 12, 6);
    });

    it('sem intermediária antes das chaves: o valor cai nas chaves', () => {
        const s = recebimentoPorSafra(venda(10, 1_000_000), PERFIL, 12, SEM_DISTRATO, 24);
        expect(mes(s.intermediarias, 12)).toBeCloseTo(100_000, 6);
    });

    it('atraso do repasse e pós-chaves estendem a série além do horizonte', () => {
        const s = recebimentoPorSafra(venda(3, 1_000_000), { ...PERFIL, atrasoDoRepasse: 3, posChavesMeses: 60 }, 12, SEM_DISTRATO, 24);
        expect(mes(s.repasse, 15)).toBeCloseTo(500_000, 6);
        expect(s.posChaves.length).toBeGreaterThanOrEqual(72);
        expect(mes(s.posChaves, 72)).toBeCloseTo(100_000 / 60, 6);
        expect(s.sinal.length).toBe(s.posChaves.length);
    });

    it('pós-chaves com juro: parcela Price', () => {
        const j = 0.01;
        const s = recebimentoPorSafra(venda(3, 1_000_000), { ...PERFIL, posChavesJurosMensal: 1 }, 12, SEM_DISTRATO, 24);
        const pmt = 100_000 * j / (1 - Math.pow(1 + j, -12));
        expect(mes(s.posChaves, 13)).toBeCloseTo(pmt, 6);
        expect(sum(s.posChaves)).toBeCloseTo(12 * pmt, 6);
    });

    it('pós-chaves sem prazo: o valor sai nas chaves', () => {
        const s = recebimentoPorSafra(venda(3, 1_000_000), { ...PERFIL, posChavesMeses: 0 }, 12, SEM_DISTRATO, 24);
        expect(mes(s.posChaves, 12)).toBeCloseTo(100_000, 6);
    });

    it('distrato de 10% em 6 meses, devolução de 50%, sem revenda', () => {
        const distrato: PremissasDeDistrato = { taxaPct: 10, defasagemMeses: 6, devolucaoPct: 50, revende: false, desagioRevendaPct: 0 };
        const sem = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, SEM_DISTRATO, 24);
        const com = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, distrato, 24);
        // A fração cancelada pagou, antes do mês 9, sinal (mês 3) + parcelas dos meses 4 a 8.
        const pagoPelaCancelada = 0.1 * (100_000 + 5 * 200_000 / 9);
        expect(total(com)).toBeCloseTo(0.9 * 1_000_000 + 0.5 * pagoPelaCancelada, 4);
        expect(mes(com.devolucaoDistrato, 9)).toBeCloseTo(-0.5 * pagoPelaCancelada, 4);
        expect(com.devolucaoDistrato.filter(x => x !== 0)).toHaveLength(1);
        // No mês do distrato a fração cancelada já não paga.
        expect(mes(com.parcelasObra, 9)).toBeCloseTo(0.9 * mes(sem.parcelasObra, 9), 6);
    });

    it('com revenda, a fração distratada vira venda nova no mês seguinte, sem novo distrato', () => {
        const distrato: PremissasDeDistrato = { taxaPct: 10, defasagemMeses: 6, devolucaoPct: 50, revende: true, desagioRevendaPct: 0 };
        const com = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, distrato, 24);
        const sem = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, { ...distrato, revende: false }, 24);
        expect(mes(com.sinal, 10) - mes(sem.sinal, 10)).toBeCloseTo(0.1 * 1_000_000 * 0.1, 6);
        expect(total(com) - total(sem)).toBeCloseTo(0.1 * 1_000_000, 4);
        expect(com.devolucaoDistrato.filter(x => x !== 0)).toHaveLength(1);
    });

    it('distrato acontece no máximo nas chaves: com defasagem que passaria delas, cai no mês das chaves', () => {
        const distrato: PremissasDeDistrato = { taxaPct: 10, defasagemMeses: 30, devolucaoPct: 50, revende: false, desagioRevendaPct: 0 };
        const s = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, distrato, 24);
        // A fração cancelada pagou sinal (mês 3), as 8 parcelas dos meses 4–11 e a intermediária do mês 9;
        // o repasse do mês 12 ela já não paga.
        const pago = 0.1 * (100_000 + 8 * 200_000 / 9 + 100_000);
        expect(mes(s.devolucaoDistrato, 12)).toBeCloseTo(-0.5 * pago, 4);
        expect(mes(s.repasse, 12)).toBeCloseTo(0.9 * 500_000, 4);
    });

    it('venda nas chaves ou depois não distrata (o comprador já recebeu o imóvel)', () => {
        const distrato: PremissasDeDistrato = { taxaPct: 10, defasagemMeses: 6, devolucaoPct: 75, revende: true, desagioRevendaPct: 10 };
        for (const mesDaVenda of [12, 15]) {
            const s = recebimentoPorSafra(venda(mesDaVenda, 1_000_000), PERFIL, 12, distrato, 30);
            expect(sum(s.devolucaoDistrato)).toBe(0);
            expect(total(s)).toBeCloseTo(1_000_000, 6);
        }
    });

    it('a revenda sai com deságio: recebe menos que a venda original', () => {
        const base = { taxaPct: 10, defasagemMeses: 6, devolucaoPct: 75, revende: true };
        const semDesagio = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, { ...base, desagioRevendaPct: 0 }, 24);
        const comDesagio = recebimentoPorSafra(venda(3, 1_000_000), PERFIL, 12, { ...base, desagioRevendaPct: 10 }, 24);
        expect(total(semDesagio) - total(comDesagio)).toBeCloseTo(0.1 * 1_000_000 * 0.1, 4);
        expect(mes(comDesagio.sinal, 10)).toBeCloseTo(0.1 * 1_000_000 * 0.9 * 0.1, 4); // sinal da revenda (10% de 90%)
    });

    it('sem vendas: tudo zero, no tamanho do horizonte', () => {
        const s = recebimentoPorSafra([], PERFIL, 12, SEM_DISTRATO, 18);
        expect(s.sinal).toHaveLength(18);
        expect(total(s)).toBe(0);
    });
});
