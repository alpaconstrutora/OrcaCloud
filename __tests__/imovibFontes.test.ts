import { describe, it, expect } from 'vitest';
import { fluxoDasFontes } from '../utils/imovibFontes';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';
import type { ImovibFundingSource } from '../types';

/** Outras fontes de capital (item 4.4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D3). */

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fonte = (over: Partial<ImovibFundingSource> = {}): ImovibFundingSource => ({
    id: 'f1', study_id: 'estudo-teste', name: 'Mútuo', kind: 'mutuo', amount: 1_000_000, entry_month: 3,
    remuneration: 'juros', rate_annual: 12, profit_share_percent: null, amortization: 'BULLET',
    term_months: 24, grace_months: 0, sort_order: 0, ...over,
});

describe('4.4 — fluxoDasFontes', () => {
    it('mútuo bullet de 1.000.000 a 12% a.a. por 24 meses: entra no mês 3 e sai com principal e juros no mês 27', () => {
        const f = fluxoDasFontes([fonte()], 40);
        expect(f.aporte[2]).toBe(1_000_000);
        expect(soma(f.aporte)).toBe(1_000_000);
        // 12% a.a. efetivos por 2 anos: 1.000.000 × 1,12² = 1.254.400 (o cronograma arredonda centavos).
        expect(f.remuneracao[26]).toBeCloseTo(-1_254_400, -1);
        expect(soma(f.remuneracao)).toBeCloseTo(f.remuneracao[26], 6);
        expect(f.avisos).toEqual([]);
    });

    it('PRICE com carência: paga só juros na carência e amortiza depois', () => {
        const f = fluxoDasFontes([fonte({ amortization: 'PRICE', term_months: 12, grace_months: 3, entry_month: 1 })], 20);
        const juros1 = f.remuneracao[1];
        expect(f.remuneracao[2]).toBeCloseTo(juros1, 2);
        expect(f.remuneracao[4]).toBeLessThan(juros1); // parcela com amortização é maior (mais negativa)
        expect(-soma(f.remuneracao)).toBeGreaterThan(1_000_000);
    });

    it('participação: o aporte entra no mês informado e a fração de cada distribuição sai para o investidor', () => {
        const f = fluxoDasFontes([fonte({ remuneration: 'participacao', profit_share_percent: 30 })], 10);
        expect(f.aporte[2]).toBe(1_000_000);
        expect(soma(f.remuneracao)).toBe(0);
        expect(f.participacao).toBeCloseTo(0.3, 12);
    });

    it('fonte que vence depois do horizonte é quitada no último mês pelo saldo, com aviso', () => {
        const f = fluxoDasFontes([fonte({ entry_month: 30 })], 40);
        expect(f.remuneracao[39]).toBeLessThan(-1_000_000);
        expect(f.remuneracao[39]).toBeGreaterThan(-1_254_400);
        expect(f.avisos.length).toBe(1);
    });

    it('fonte que entra depois do horizonte fica fora, com aviso', () => {
        const f = fluxoDasFontes([fonte({ entry_month: 50 })], 40);
        expect(soma(f.aporte)).toBe(0);
        expect(f.avisos.length).toBe(1);
    });

    it('participações que somam mais de 100% avisam', () => {
        const p = (id: string) => fonte({ id, remuneration: 'participacao', profit_share_percent: 60 });
        expect(fluxoDasFontes([p('a'), p('b')], 10).avisos.length).toBe(1);
    });
});

describe('4.4 — motor com outras fontes', () => {
    it('sem fontes, o resultado é o de antes', () => {
        const a = computeImovibMath(baseStudy());
        const b = computeImovibMath(baseStudy({ funding_sources: [] }));
        expect(b.vpl).toBe(a.vpl);
    });

    it('o mútuo entra em aporteDeTerceiros e sai em remuneracaoDeTerceiros', () => {
        const r = computeImovibMath(baseStudy({ funding_sources: [fonte()] }));
        expect(r.monthlyFlows[2].linhas.aporteDeTerceiros).toBe(1_000_000);
        expect(r.monthlyFlows[26].linhas.remuneracaoDeTerceiros).toBeCloseTo(-1_254_400, -1);
        expect(r.capital.terceiros).toBe(1_000_000);
    });

    it('uma fonte com 30% de participação reduz o lucro do incorporador em 30% do lucro distribuído', () => {
        const s = baseStudy({ funding_sources: [fonte({ remuneration: 'participacao', profit_share_percent: 30 })] });
        const r = computeImovibMath(s);
        const distribuido = soma(r.aportes.map(a => a.distribuicao));
        const participacao = soma(r.monthlyFlows.map(f => f.linhas.remuneracaoDeTerceiros));
        expect(participacao).toBeCloseTo(-0.3 * distribuido, 2);
        // Sem a participação, o incorporador ficaria com o fluxo antes dela.
        const antes = soma(r.monthlyFlows.map(f => f.net)) - participacao;
        expect(soma(r.monthlyFlows.map(f => f.net))).toBeCloseTo(antes - 0.3 * distribuido, 2);
    });

    it('o fluxo do projeto não muda com nenhuma fonte', () => {
        const a = computeImovibMath(baseStudy());
        const b = computeImovibMath(baseStudy({ funding_sources: [fonte(), fonte({ id: 'f2', remuneration: 'participacao', profit_share_percent: 20 })] }));
        expect(b.vplProjeto).toBeCloseTo(a.vplProjeto, 6);
        b.monthlyFlows.forEach((f, i) => expect(f.netProjeto).toBeCloseTo(a.monthlyFlows[i].netProjeto, 6));
        expect(b.vpl).not.toBeCloseTo(a.vpl, 0);
    });
});
