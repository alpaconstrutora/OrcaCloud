import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import type { LinhasDoMes } from '../utils/imovibMotor';
import { ESTUDOS_DE_REGRESSAO, baseStudy, withCost } from './fixtures/imovibEstudos';

/**
 * Fluxo aberto por linha e visão do projeto (item 0.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const somaLinhas = (l: LinhasDoMes) => sum(Object.values(l));
const RECEITAS: (keyof LinhasDoMes)[] = ['receitaSinal', 'receitaParcelasObra', 'receitaIntermediarias', 'receitaRepasse', 'receitaPosChaves'];
const CUSTOS: (keyof LinhasDoMes)[] = ['terreno', 'rubricasTerreno', 'obra', 'rubricasObra', 'rubricasVendas', 'carregamentoDoEstoque'];
const total = (r: ReturnType<typeof computeImovibMath>, k: keyof LinhasDoMes) => sum(r.monthlyFlows.map(f => f.linhas[k]));

describe('0.3 — linhas do fluxo', () => {
    for (const [nome, estudo] of Object.entries(ESTUDOS_DE_REGRESSAO)) {
        it(`${nome}: em todo mês o caixa é a soma das linhas`, () => {
            const r = computeImovibMath(estudo());
            for (const f of r.monthlyFlows) {
                expect(somaLinhas(f.linhas)).toBeCloseTo(f.net, 4);
                expect(sum(RECEITAS.map(k => f.linhas[k]))).toBeCloseTo(f.rev, 4);
                expect(-sum(CUSTOS.map(k => f.linhas[k]))).toBeCloseTo(f.cost, 4);
            }
        });

        it(`${nome}: o caixa do projeto é o do acionista sem a dívida`, () => {
            const r = computeImovibMath(estudo());
            let acc = 0;
            for (const f of r.monthlyFlows) {
                expect(f.netProjeto).toBeCloseTo(f.net - f.linhas.liberacaoDivida - f.linhas.pagamentoDaDivida, 4);
                acc += f.netProjeto;
                expect(f.accProjeto).toBeCloseTo(acc, 4);
            }
        });
    }

    it('sem dívida, TIR e VPL do projeto são os do acionista', () => {
        for (const nome of ['base', 'completo', 'espelhoInflacao']) {
            const r = computeImovibMath(ESTUDOS_DE_REGRESSAO[nome]());
            expect(r.annualIrrProjeto).toBeCloseTo(r.annualIrr, 6);
            expect(r.vplProjeto).toBeCloseTo(r.vpl, 2);
            expect(total(r, 'liberacaoDivida')).toBe(0);
            expect(total(r, 'pagamentoDaDivida')).toBe(0);
        }
    });

    it('dívida de 60% a 14% a.a.: alavanca a TIR do acionista e não muda o projeto', () => {
        const r = computeImovibMath(ESTUDOS_DE_REGRESSAO.divida60());
        const semDivida = computeImovibMath(ESTUDOS_DE_REGRESSAO.base());
        expect(r.annualIrr).toBeGreaterThan(r.annualIrrProjeto);
        expect(r.annualIrrProjeto).toBeCloseTo(semDivida.annualIrr, 6);
        expect(r.vplProjeto).toBeCloseTo(semDivida.vpl, 2);
        // Tudo o que foi liberado volta, com os juros.
        expect(-total(r, 'pagamentoDaDivida')).toBeCloseTo(total(r, 'liberacaoDivida') + sum(r.monthlyFlows.map(f => f.jurosDoMes)), 2);
        expect(total(r, 'liberacaoDivida')).toBeCloseTo(0.6 * 40 * 90 * 4_500, 2);
    });

    it('sem rubricas, imposto e corretagem da Dinâmica viram as linhas de impostos e comercial', () => {
        const r = computeImovibMath(ESTUDOS_DE_REGRESSAO.base());
        const rev = sum(r.monthlyFlows.map(f => f.rev));
        expect(total(r, 'impostos')).toBeCloseTo(-0.04 * rev, 2);
        expect(total(r, 'comercial')).toBeCloseTo(-0.05 * rev, 2);
        expect(total(r, 'outrasDeducoes')).toBe(0);
        expect(total(r, 'terreno')).toBe(-5_000_000);
    });

    it('com rubricas, a categoria 7 é imposto, a 5 é comercial e a 8 é outra dedução', () => {
        const r = computeImovibMath(ESTUDOS_DE_REGRESSAO.completo());
        const rev = sum(r.monthlyFlows.map(f => f.rev));
        expect(total(r, 'impostos')).toBeCloseTo(-0.04 * rev, 2);
        expect(total(r, 'comercial')).toBeCloseTo(-0.05 * rev, 2);
        expect(total(r, 'rubricasVendas')).toBeCloseTo(-240_000, 2);
        expect(total(r, 'rubricasTerreno')).toBeCloseTo(-150_000, 2);

        const comFinanceira = computeImovibMath(baseStudy({
            capex_items: [{ id: 'f', study_id: 'estudo-teste', category: '8. Financeiras', name: 'Estruturação', value_type: 'percent', value: 1.5, base: 'vgv', created_at: '', updated_at: '' }],
        }));
        const rev2 = sum(comFinanceira.monthlyFlows.map(f => f.rev));
        expect(total(comFinanceira, 'outrasDeducoes')).toBeCloseTo(-0.015 * rev2, 2);
        expect(total(comFinanceira, 'impostos')).toBe(0);
    });

    it('deduções acima de 100% da receita aparecem no caixa (não somem) e geram aviso', () => {
        const r = computeImovibMath(baseStudy({ tax_rate: 80, brokerage_fee: 40 }));
        for (const f of r.monthlyFlows) expect(somaLinhas(f.linhas)).toBeCloseTo(f.net, 4);
        const mesComReceita = r.monthlyFlows.find(f => f.rev > 0 && f.cost === 0)!;
        expect(mesComReceita.net).toBeLessThan(0);
        expect(r.avisos.find(a => a.codigo === 'receita_liquida_negativa')?.aba).toBe('viability_dynamic');
    });

    it('permuta acima de 100% do VGV deixa a receita negativa e gera aviso', () => {
        const r = computeImovibMath(baseStudy({ swap_financial_percent: 110 }));
        expect(r.netVgvTotal).toBeLessThan(0);
        for (const f of r.monthlyFlows) expect(somaLinhas(f.linhas)).toBeCloseTo(f.net, 4);
        expect(r.avisos.find(a => a.codigo === 'receita_liquida_negativa')?.aba).toBe('capital');
    });

    it('percentuais normais não geram o aviso', () => {
        for (const estudo of Object.values(ESTUDOS_DE_REGRESSAO)) {
            expect(computeImovibMath(estudo()).avisos.map(a => a.codigo)).not.toContain('receita_liquida_negativa');
        }
    });
});

describe('0.3 (pendência) — linhas do fluxo nos casos que o teste não cobria', () => {
    const fecha = (r: ReturnType<typeof computeImovibMath>) => {
        for (const f of r.monthlyFlows) {
            expect(somaLinhas(f.linhas)).toBeCloseTo(f.net, 4);
            expect(sum(RECEITAS.map(k => f.linhas[k]))).toBeCloseTo(f.rev, 4);
            expect(-sum(CUSTOS.map(k => f.linhas[k]))).toBeCloseTo(f.cost, 4);
        }
    };

    it('dívida quitada no fim: o caixa do último mês é a soma das linhas, com a quitação na linha da dívida', () => {
        const r = computeImovibMath(withCost(14_000, { funding_debt_percent: 100, financing_rate_annual: 14 }));
        expect(r.debtPayoffAtEnd).toBeGreaterThan(0);
        fecha(r);
        const ultimo = r.monthlyFlows[r.monthlyFlows.length - 1];
        expect(-ultimo.linhas.pagamentoDaDivida).toBeGreaterThanOrEqual(r.debtPayoffAtEnd - 1e-6);
        expect(-total(r, 'pagamentoDaDivida')).toBeCloseTo(total(r, 'liberacaoDivida') + sum(r.monthlyFlows.map(f => f.jurosDoMes)), 2);
    });

    it('CAPEX simplificado: a linha da obra é o custo do simplificado e o caixa fecha', () => {
        const r = computeImovibMath(baseStudy({ capex_mode: 'simplified', capex_simplified_cost_sqm: 4_000, capex_simplified_area_sqm: 5_000 }));
        fecha(r);
        expect(-total(r, 'obra')).toBeCloseTo(5_000 * 4_000, 2);
        expect(r.constCostTotal).toBeCloseTo(5_000 * 4_000, 2);
    });
});
