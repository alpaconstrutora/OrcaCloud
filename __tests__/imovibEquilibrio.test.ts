import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { aplicarVariacao, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { terrenoMaximo, precoMinimo, custoMaximoDeObra, vendasMinimas } from '../utils/imovibEquilibrio';
import { baseStudy } from './fixtures/imovibEstudos';

/** Variações e pontos de equilíbrio (item 2.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const lucro = (s: any, o?: any) => computeImovibMath(s, o).monthlyFlows.reduce((a, f) => a + f.net, 0);

describe('2.2 — aplicarVariacao', () => {
    const VARIAVEIS: VariavelDoEstudo[] = ['preco', 'custo_obra', 'terreno', 'velocidade_vendas', 'prazo_obra', 'juros_financiamento', 'indice_obra', 'distrato'];

    it('nunca altera o estudo recebido', () => {
        for (const v of VARIAVEIS) {
            const s = baseStudy({ cancellation_rate_percent: 5 });
            const antes = JSON.stringify(s);
            aplicarVariacao(s, v, 10);
            expect(JSON.stringify(s), v).toBe(antes);
        }
    });

    it('cada variável mexe no campo certo, na unidade certa', () => {
        const s = baseStudy({ inflation_rate: 0.4, cancellation_rate_percent: 5 });
        expect(aplicarVariacao(s, 'preco', -10).options).toEqual({ vgvDelta: -10 });
        expect(aplicarVariacao(s, 'custo_obra', 10).options).toEqual({ costDelta: 10 });
        expect(aplicarVariacao(s, 'terreno', 10).study.land_cost).toBeCloseTo(5_500_000, 6);
        expect(aplicarVariacao(s, 'velocidade_vendas', 6).study.sales_duration_months).toBe(30);
        expect(aplicarVariacao(s, 'prazo_obra', 3).study.construction_duration_months).toBe(27);
        expect(aplicarVariacao(s, 'juros_financiamento', 2).study.financing_rate_annual).toBe(12);
        expect(aplicarVariacao(s, 'indice_obra', 0.2).study.cost_index_rate_monthly).toBeCloseTo(0.6, 12);
        expect(aplicarVariacao(s, 'distrato', 5).study.cancellation_rate_percent).toBe(10);
    });

    it('prazos e distrato não ficam abaixo do mínimo', () => {
        const s = baseStudy();
        expect(aplicarVariacao(s, 'velocidade_vendas', -100).study.sales_duration_months).toBe(1);
        expect(aplicarVariacao(s, 'prazo_obra', -100).study.construction_duration_months).toBe(1);
        expect(aplicarVariacao(s, 'distrato', -50).study.cancellation_rate_percent).toBe(0);
    });
});

describe('2.2 — pontos de equilíbrio', () => {
    it('valor máximo do terreno: recalcular com ele zera o VPL', () => {
        const s = baseStudy();
        const max = terrenoMaximo(s, { tipo: 'vpl_zero' });
        expect(max.valor).not.toBeNull();
        expect(max.valor!).toBeGreaterThan(5_000_000);
        expect(Math.abs(computeImovibMath({ ...s, land_cost: max.valor }).vpl)).toBeLessThan(1);
    });

    it('margem-alvo maior pede terreno menor; recalcular dá a margem pedida', () => {
        const s = baseStudy();
        const m10 = terrenoMaximo(s, { tipo: 'margem', pct: 10 }).valor!;
        const m20 = terrenoMaximo(s, { tipo: 'margem', pct: 20 }).valor!;
        expect(m20).toBeLessThan(m10);
        const r = computeImovibMath({ ...s, land_cost: m20 });
        expect(lucro({ ...s, land_cost: m20 }) / r.vgvTotal).toBeCloseTo(0.20, 4);
    });

    it('TIR-alvo: recalcular dá a TIR pedida', () => {
        const s = baseStudy();
        const t = terrenoMaximo(s, { tipo: 'tir', pctAnual: 15 }).valor!;
        expect(computeImovibMath({ ...s, land_cost: t }).annualIrr).toBeCloseTo(15, 2);
    });

    it('sem VGV: sem_vgv; inviável mesmo com terreno zero: sem_raiz', () => {
        const semVgv = baseStudy();
        semVgv.blocks[0].sales_price_sqm = 0;
        expect(terrenoMaximo(semVgv, { tipo: 'vpl_zero' })).toEqual({ valor: null, motivo: 'sem_vgv' });
        const inviavel = baseStudy();
        inviavel.blocks[0].construction_cost_sqm = 20_000;
        expect(terrenoMaximo(inviavel, { tipo: 'vpl_zero' })).toEqual({ valor: null, motivo: 'sem_raiz' });
    });

    it('queda de preço suportada: com ela o VPL vai a zero', () => {
        const s = baseStudy();
        const p = precoMinimo(s);
        expect(p.valor!).toBeLessThan(0);
        expect(Math.abs(computeImovibMath(s, { vgvDelta: p.valor! }).vpl)).toBeLessThan(1);
    });

    it('estudo inviável: o preço precisa subir', () => {
        const s = baseStudy();
        s.blocks[0].construction_cost_sqm = 9_000;
        const p = precoMinimo(s);
        expect(p.valor!).toBeGreaterThan(0);
        expect(Math.abs(computeImovibMath(s, { vgvDelta: p.valor! }).vpl)).toBeLessThan(1);
    });

    it('alta de custo de obra suportada: com ela o VPL vai a zero', () => {
        const s = baseStudy();
        const c = custoMaximoDeObra(s);
        expect(c.valor!).toBeGreaterThan(0);
        expect(Math.abs(computeImovibMath(s, { costDelta: c.valor! }).vpl)).toBeLessThan(1);
    });

    it('vendas mínimas: % do VGV vendável; vender essa fração com o mesmo ritmo zera o VPL', () => {
        const s = baseStudy();
        const v = vendasMinimas(s).valor!;
        expect(v).toBeLessThan(100);
        // Receita linear no VGV: vender v% (a curva linear vende 100%) = preço em v% do original.
        expect(Math.abs(computeImovibMath(s, { vgvDelta: v - 100 }).vpl)).toBeLessThan(1);
    });

    it('vendas mínimas com estoque: a base é o VGV vendável, não o que a curva vende', () => {
        const s = baseStudy({ sales_curve_type: 'vso', sales_vso_percent: 8 });
        const r = computeImovibMath(s);
        expect(r.estoqueNaoVendidoPct).toBeGreaterThan(0);
        const v = vendasMinimas(s).valor!;
        const fracaoVendida = 1 - r.estoqueNaoVendidoPct;
        expect(v).toBeCloseTo((100 + precoMinimo(s).valor!) * fracaoVendida, 6);
        // Aqui é preciso vender mais do que a curva vende (há estoque para isso), mas não mais que 100%.
        expect(v).toBeGreaterThan(fracaoVendida * 100);
        expect(v).toBeLessThan(100);
    });

    it('vendas mínimas acima do VGV vendável: não existe (mesmo vendendo tudo o VPL fica negativo)', () => {
        const s = baseStudy();
        s.blocks[0].construction_cost_sqm = 9_000;
        expect(vendasMinimas(s)).toEqual({ valor: null, motivo: 'acima_do_vgv' });
    });
});

/** Pendência da Fase 2: os pontos de equilíbrio levavam ~325 ms (TIR calculada à toa nas buscas). */
describe('pontos de equilíbrio sem trabalho repetido', () => {
    it('motor com semTir: mesmo VPL e fluxo, TIR vazia e sem aviso de TIR', () => {
        const s = baseStudy({ sales_start_month: 1, construction_start_month: 1 });
        const com = computeImovibMath(s);
        const sem = computeImovibMath(s, { semTir: true });
        expect(sem.vpl).toBe(com.vpl);
        expect(sem.monthlyFlows).toEqual(com.monthlyFlows);
        expect(sem.annualIrr).toBeNaN();
        expect(sem.annualIrrProjeto).toBeNaN();
        expect(sem.avisos.some(a => a.codigo === 'tir_multipla')).toBe(false);
    });

    it('vendas mínimas aproveitam o preço mínimo já calculado', () => {
        const s = baseStudy();
        const p = precoMinimo(s);
        expect(vendasMinimas(s, p)).toEqual(vendasMinimas(s));
    });

    it('terreno para a TIR-alvo continua calculando a TIR', () => {
        const s = baseStudy();
        const t = terrenoMaximo(s, { tipo: 'tir', pctAnual: 20 });
        expect(t.valor).not.toBeNull();
        expect(computeImovibMath({ ...s, land_cost: t.valor! }).annualIrr).toBeCloseTo(20, 1);
    });
});

describe('pendência da Fase 2 — TIR-alvo quando o fluxo com terreno 0 não tem TIR', () => {
    // Tudo à vista no sinal e obra barata: com terreno 0 o caixa nunca fica negativo (TIR "infinita").
    const semSaida = () => {
        const e = baseStudy({
            land_cost: 0, revenue_downpayment_percent: 100, revenue_construction_percent: 0, revenue_handover_percent: 0,
            default_rate_percent: 0, cancellation_rate_percent: 0, tax_rate: 0, brokerage_fee: 0,
        });
        e.blocks[0].construction_cost_sqm = 0;
        return e;
    };

    it('a pré-condição vale: sem terreno, o fluxo não tem TIR', () => {
        expect(Number.isFinite(computeImovibMath(semSaida()).annualIrr)).toBe(false);
    });

    it('acha o terreno que leva a TIR ao alvo em vez de "sem raiz"', () => {
        const p = terrenoMaximo(semSaida(), { tipo: 'tir', pctAnual: 20 });
        expect(p.valor).not.toBeNull();
        const r = computeImovibMath({ ...semSaida(), land_cost: p.valor! });
        expect(r.annualIrr).toBeCloseTo(20, 0);
    });
});
