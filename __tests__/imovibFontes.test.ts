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

    it('uma fonte com 30% de participação recebe o capital de volta e 30% do LUCRO; o incorporador fica com 70% do lucro', () => {
        const s = baseStudy({ funding_sources: [fonte({ remuneration: 'participacao', profit_share_percent: 30 })] });
        const r = computeImovibMath(s);
        const lucro = soma(r.aportes.map(a => a.distribuicao)) - soma(r.aportes.map(a => a.aporte)) - 1_000_000;
        expect(lucro).toBeGreaterThan(0);
        const paraAFonte = -soma(r.monthlyFlows.map(f => f.linhas.remuneracaoDeTerceiros));
        expect(paraAFonte).toBeCloseTo(1_000_000 + 0.3 * lucro, 2);
        expect(soma(r.monthlyFlows.map(f => f.net))).toBeCloseTo(0.7 * lucro, 2);
        expect(soma(r.aportes.map(a => a.paraTerceiros))).toBeCloseTo(paraAFonte, 2);
    });

    it('a parte da fonte por participação não depende do caixa mínimo (reserva é liquidez, não lucro)', () => {
        const comFonte = (min: number) => computeImovibMath(baseStudy({ min_cash_balance: min, funding_sources: [fonte({ remuneration: 'participacao', profit_share_percent: 30 })] }));
        const a = comFonte(0);
        const b = comFonte(2_000_000);
        const paraAFonte = (r: ReturnType<typeof computeImovibMath>) => soma(r.monthlyFlows.map(f => f.linhas.remuneracaoDeTerceiros));
        expect(paraAFonte(b)).toBeCloseTo(paraAFonte(a), 2);
        expect(soma(b.monthlyFlows.map(f => f.net))).toBeCloseTo(soma(a.monthlyFlows.map(f => f.net)), 2);
    });

    it('estudo com prejuízo: a fonte por participação recebe só parte do capital de volta, sem lucro', () => {
        const s = baseStudy({ land_cost: 30_000_000, funding_sources: [fonte({ remuneration: 'participacao', profit_share_percent: 30 })] });
        const r = computeImovibMath(s);
        const paraAFonte = -soma(r.monthlyFlows.map(f => f.linhas.remuneracaoDeTerceiros));
        expect(paraAFonte).toBeGreaterThanOrEqual(0);
        expect(paraAFonte).toBeLessThan(1_000_000);
    });

    it('4B.2 — fonte que entra depois do pico de exposição avisa; a que entra antes não', () => {
        const base = computeImovibMath(baseStudy());
        const pico = base.monthlyFlows.reduce((m, f) => (f.acc < base.monthlyFlows[m - 1].acc ? f.month : m), 1);
        expect(pico).toBeLessThan(base.duration);
        const depois = computeImovibMath(baseStudy({ funding_sources: [fonte({ name: 'SCP tardia', remuneration: 'participacao', profit_share_percent: 30, entry_month: base.duration })] }));
        const aviso = depois.avisos.find(a => a.codigo === 'fontes_de_capital' && a.mensagem.includes('SCP tardia'));
        expect(aviso?.aba).toBe('capital');
        expect(aviso!.mensagem).toContain(`mês ${base.duration}`);
        expect(aviso!.mensagem).toContain(`mês ${pico}`);
        expect(aviso!.mensagem).toMatch(/lucro/);
        const juros = computeImovibMath(baseStudy({ funding_sources: [fonte({ name: 'Mútuo tardio', entry_month: base.duration, term_months: 1 })] }));
        // Entrando no último mês, o mútuo também vence depois do fim (outro aviso).
        expect(juros.avisos.find(a => a.mensagem.includes('Mútuo tardio') && a.mensagem.includes('pico'))!.mensagem).toMatch(/juros/);
        const antes = computeImovibMath(baseStudy({ funding_sources: [fonte({ remuneration: 'participacao', profit_share_percent: 30, entry_month: 3 })] }));
        expect(antes.avisos.filter(a => a.codigo === 'fontes_de_capital')).toEqual([]);
    });

    it('o fluxo do projeto não muda com nenhuma fonte', () => {
        const a = computeImovibMath(baseStudy());
        const b = computeImovibMath(baseStudy({ funding_sources: [fonte(), fonte({ id: 'f2', remuneration: 'participacao', profit_share_percent: 20 })] }));
        expect(b.vplProjeto).toBeCloseTo(a.vplProjeto, 6);
        b.monthlyFlows.forEach((f, i) => expect(f.netProjeto).toBeCloseTo(a.monthlyFlows[i].netProjeto, 6));
        expect(b.vpl).not.toBeCloseTo(a.vpl, 0);
    });
});
