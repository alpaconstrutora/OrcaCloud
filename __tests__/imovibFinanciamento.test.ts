import { describe, it, expect } from 'vitest';
import { fluxoDaDivida, PremissasDoFinanciamento } from '../utils/imovibFinanciamento';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

/** Financiamento à produção com regras de liberação e pagamento (item 4.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const PADRAO: PremissasDoFinanciamento = {
    fracaoDaObra: 0.5, jurosMensal: 0.01, defasagemDaLiberacao: 0, vendasMinimasPct: 0,
    jurosNaObra: 'capitaliza', amortizaCom: 'receitas',
};
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 6 meses de obra de 100, receita só no fim; vendas acumuladas sobem 10 p.p. por mês.
const CUSTO = [100, 100, 100, 100, 100, 100, 0, 0, 0];
const RECEITA = [0, 0, 0, 0, 0, 20, 40, 400, 400];
const REPASSE = [0, 0, 0, 0, 0, 0, 0, 100, 100];
const VENDAS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

describe('4.1 — fluxoDaDivida', () => {
    it('padrão: libera no mês do custo, capitaliza os juros e amortiza com a receita (conta à mão)', () => {
        const d = fluxoDaDivida([100, 100, 0, 0], [0, 0, 50, 500], [0, 0, 0, 0], [0, 0, 0, 0], PADRAO);
        expect(d.liberacao).toEqual([50, 50, 0, 0]);
        expect(d.juros[1]).toBeCloseTo(0.5, 12);
        expect(d.juros[2]).toBeCloseTo(1.005, 12);
        expect(d.pagamento[2]).toBeCloseTo(50, 12);
        expect(d.pagamento[3]).toBeCloseTo(52.02005, 9);
        expect(d.saldo[3]).toBe(0);
        expect(d.quitacaoNoFim).toBe(0);
        expect(d.naoLiberado).toBe(0);
    });

    it('com exigência de 30% de vendas, a liberação é zero até o mês em que a venda acumulada chega a 30% e então libera o acumulado', () => {
        const d = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, vendasMinimasPct: 30 });
        expect(d.liberacao.slice(0, 2)).toEqual([0, 0]);
        expect(d.liberacao[2]).toBe(150); // meses 1, 2 e 3
        expect(d.liberacao.slice(3, 6)).toEqual([50, 50, 50]);
        expect(soma(d.liberacao)).toBe(300);
    });

    it('defasagem de 1 mês: o custo do mês m é liberado no mês m + 1', () => {
        const d = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, defasagemDaLiberacao: 1 });
        expect(d.liberacao).toEqual([0, 50, 50, 50, 50, 50, 50, 0, 0]);
    });

    it('exigência de vendas que só se cumpre depois da obra e da defasagem: nada é liberado', () => {
        const d = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, vendasMinimasPct: 75 });
        expect(soma(d.liberacao)).toBe(0);
        expect(d.naoLiberado).toBe(300);
    });

    it('juros pagos todo mês: o saldo devedor no fim da obra é menor que com juros capitalizados', () => {
        const cap = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, PADRAO);
        const pago = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, jurosNaObra: 'paga_mensal' });
        expect(pago.saldo[5]).toBeLessThan(cap.saldo[5]);
        expect(pago.pagamento[1]).toBeCloseTo(0.5, 12); // juros do mês 2 sobre o saldo de 50
    });

    it('amortizar só com o repasse aumenta os juros totais', () => {
        const receitas = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, PADRAO);
        const repasse = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, amortizaCom: 'repasse' });
        expect(soma(repasse.juros)).toBeGreaterThan(soma(receitas.juros));
    });

    it('a soma dos pagamentos mais a quitação no fim é a soma das liberações mais a dos juros, em toda combinação', () => {
        for (const jurosNaObra of ['capitaliza', 'paga_mensal'] as const)
            for (const amortizaCom of ['receitas', 'repasse'] as const)
                for (const defasagemDaLiberacao of [0, 2])
                    for (const vendasMinimasPct of [0, 30]) {
                        const d = fluxoDaDivida(CUSTO, RECEITA, REPASSE, VENDAS, { ...PADRAO, jurosNaObra, amortizaCom, defasagemDaLiberacao, vendasMinimasPct });
                        expect(soma(d.pagamento) + d.quitacaoNoFim).toBeCloseTo(soma(d.liberacao) + soma(d.juros), 9);
                        expect(d.saldo[d.saldo.length - 1]).toBe(0);
                    }
    });

    it('receita que não amortiza tudo: o saldo é quitado no último mês', () => {
        const d = fluxoDaDivida([100], [0], [0], [0], PADRAO);
        expect(d.quitacaoNoFim).toBe(50);
        expect(d.saldo).toEqual([0]);
    });
});

describe('4.1 — motor com as regras do financiamento', () => {
    const comDivida = (over: Record<string, unknown> = {}) => baseStudy({ funding_debt_percent: 60, financing_rate_annual: 14, ...over });

    it('campos vazios dão o mesmo número de hoje (o padrão reproduz o motor antigo)', () => {
        const antes = computeImovibMath(comDivida());
        const explicito = computeImovibMath(comDivida({
            financing_release_lag_months: 0, financing_min_sales_percent: 0,
            financing_interest_mode: 'capitaliza', financing_amortization: 'receitas',
        }));
        expect(explicito.vpl).toBe(antes.vpl);
        expect(explicito.maxExposure).toBe(antes.maxExposure);
    });

    it('exigir 30% de vendas para liberar aumenta o capital próprio necessário', () => {
        const sem = computeImovibMath(comDivida());
        // Vendas devagar: o estudo vende em 60 meses, então 30% só chega no meio da obra.
        const devagar = (over: Record<string, unknown> = {}) => comDivida({ sales_duration_months: 60, ...over });
        const base = computeImovibMath(devagar());
        const com = computeImovibMath(devagar({ financing_min_sales_percent: 30 }));
        expect(com.capital.proprio).toBeGreaterThan(base.capital.proprio);
        expect(sem.capital.proprio).toBeGreaterThan(0);
    });

    it('nada liberado gera aviso que leva à aba Capital', () => {
        const r = computeImovibMath(comDivida({ financing_min_sales_percent: 101 }));
        const aviso = r.avisos.find(a => a.codigo === 'financiamento_nao_liberado');
        expect(aviso?.aba).toBe('capital');
    });

    it('o fluxo do projeto não muda com as regras do financiamento', () => {
        const a = computeImovibMath(comDivida());
        const b = computeImovibMath(comDivida({ financing_release_lag_months: 2, financing_interest_mode: 'paga_mensal', financing_amortization: 'repasse' }));
        expect(b.vplProjeto).toBeCloseTo(a.vplProjeto, 6);
        expect(b.vpl).not.toBeCloseTo(a.vpl, 0);
    });
});
