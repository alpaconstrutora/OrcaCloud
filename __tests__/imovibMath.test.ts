import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Motor dos Estudos de Viabilidade (Imovib).
 *
 * Os cenários vêm da avaliação de 2026-10-12
 * (docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, Fase 1). Cada um
 * reproduz um erro medido no motor antigo e afirma o comportamento correto.
 */

// Estudo-base: 40 unidades de 70 m² privativos + 20 m² comuns, R$ 10.000/m² de
// venda, R$ 4.500/m² de obra, terreno de R$ 5 mi. Todas as premissas que o
// motor lê vêm preenchidas, para o teste não depender de padrão.
const baseStudy = (over: Record<string, any> = {}): any => ({
    id: 'estudo-teste',
    name: 'Estudo teste',
    construction_duration_months: 24,
    sales_duration_months: 24,
    construction_start_month: 6,
    sales_start_month: 1,
    inflation_rate: 0,
    discount_rate: 12,
    tax_rate: 4,
    brokerage_fee: 5,
    financing_percent: 0,
    financing_rate_annual: 10,
    revenue_downpayment_percent: 10,
    revenue_construction_percent: 20,
    revenue_handover_percent: 70,
    default_rate_percent: 0,
    cancellation_rate_percent: 0,
    funding_debt_percent: 0,
    swap_financial_percent: 0,
    swap_physical_percent: 0,
    land_cost: 5_000_000,
    blocks: [{
        id: 'b1', name: 'Torre A', sales_price_sqm: 10_000, construction_cost_sqm: 4_500,
        units: [{ id: 'u1', quantity: 40, private_area: 70, common_area: 20 }],
    }],
    ...over,
});

const withCost = (costSqm: number, over: Record<string, any> = {}) => {
    const s = baseStudy(over);
    s.blocks = [{ ...s.blocks[0], construction_cost_sqm: costSqm }];
    return s;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A TIR devolvida é raiz de verdade: o VPL nela (taxa mensal) é ~0. */
const tirEhRaiz = (r: ReturnType<typeof computeImovibMath>) => {
    const flows = r.monthlyFlows.map(f => f.net);
    const mensal = Math.pow(1 + r.annualIrr / 100, 1 / 12) - 1;
    const npv = flows.reduce((acc, v, i) => acc + v / Math.pow(1 + mensal, i), 0);
    return Math.abs(npv) <= 1e-6 * sum(flows.map(Math.abs));
};

describe('computeImovibMath — estudo-base', () => {
    it('calcula VGV, custo e área com pavimentos', () => {
        const r = computeImovibMath(baseStudy());
        expect(r.vgvTotal).toBeCloseTo(40 * 70 * 10_000);
        expect(r.constCostTotal).toBeCloseTo(40 * 90 * 4_500);
        expect(r.totalBlockArea).toBeCloseTo(40 * 90);
        expect(r.avisos).toEqual([]);
        expect(Number.isFinite(r.annualIrr)).toBe(true);
        expect(tirEhRaiz(r)).toBe(true);
    });

    it('área total multiplica por pavimentos (mesma área do CAPEX)', () => {
        const s = baseStudy();
        s.blocks[0].units[0].pavimentos = 3;
        expect(computeImovibMath(s).totalBlockArea).toBeCloseTo(3 * 40 * 90);
    });
});

describe('1.2 — saldo de dívida é quitado no fim', () => {
    const divida = { funding_debt_percent: 100, financing_rate_annual: 14 };

    it('custo de obra maior derruba o VPL mesmo com 100% de dívida', () => {
        // Motor antigo: VPL −4,48 mi nos dois casos — o saldo que sobrava sumia.
        const barato = computeImovibMath(withCost(9_000, divida));
        const caro = computeImovibMath(withCost(14_000, divida));
        expect(caro.vpl).toBeLessThan(barato.vpl - 1_000_000);
    });

    it('expõe o valor quitado no último mês e o desconta do fluxo', () => {
        const r = computeImovibMath(withCost(14_000, divida));
        expect(r.debtPayoffAtEnd).toBeGreaterThan(0);
        expect(r.avisos.some(a => a.codigo === 'divida_quitada_no_fim')).toBe(true);
    });

    it('dívida a juro zero só muda o calendário: resultado acumulado igual ao do capital próprio', () => {
        const proprio = computeImovibMath(withCost(14_000));
        const juroZero = computeImovibMath(withCost(14_000, { funding_debt_percent: 100, financing_rate_annual: 0 }));
        const acc = (r: typeof proprio) => r.monthlyFlows[r.monthlyFlows.length - 1].acc;
        expect(acc(juroZero)).toBeCloseTo(acc(proprio), 2);
    });

    it('sem saldo devedor no fim, não há quitação nem aviso', () => {
        const r = computeImovibMath(baseStudy());
        expect(r.debtPayoffAtEnd).toBe(0);
        expect(r.avisos.some(a => a.codigo === 'divida_quitada_no_fim')).toBe(false);
    });
});

describe('1.3 — zero é zero', () => {
    it('imposto e corretagem 0 não viram 4% e 6%', () => {
        const r = computeImovibMath(baseStudy({ tax_rate: 0, brokerage_fee: 0 }));
        const totalRev = sum(r.monthlyFlows.map(f => f.rev));
        const totalCost = sum(r.monthlyFlows.map(f => f.cost));
        const acc = r.monthlyFlows[r.monthlyFlows.length - 1].acc;
        expect(acc).toBeCloseTo(totalRev - totalCost, 2);
    });

    it('juro de financiamento 0 não vira 10%', () => {
        const r = computeImovibMath(baseStudy({ funding_debt_percent: 100, financing_rate_annual: 0 }));
        const proprio = computeImovibMath(baseStudy());
        const acc = (x: typeof r) => x.monthlyFlows[x.monthlyFlows.length - 1].acc;
        expect(acc(r)).toBeCloseTo(acc(proprio), 2);
    });

    it('duração zero não é trocada em silêncio: gera aviso', () => {
        const r = computeImovibMath(baseStudy({ construction_duration_months: 0 }));
        expect(r.avisos.some(a => a.codigo === 'cronograma_invalido')).toBe(true);
    });
});

describe('1.4 — um único conjunto de padrões', () => {
    it('campos vazios calculam igual aos padrões preenchidos', () => {
        const vazio: any = baseStudy();
        for (const k of Object.keys(IMOVIB_DEFAULTS)) delete vazio[k];
        const preenchido = baseStudy({ ...IMOVIB_DEFAULTS });
        const a = computeImovibMath(vazio);
        const b = computeImovibMath(preenchido);
        expect(a.vpl).toBeCloseTo(b.vpl, 2);
        expect(a.netVgvTotal).toBeCloseTo(b.netVgvTotal, 2);
        expect(a.duration).toBe(b.duration);
    });
});

describe('1.5 — TIR honesta', () => {
    it('nunca devolve o limite da busca como taxa', () => {
        const cenarios = [
            withCost(9_000, { funding_debt_percent: 100, financing_rate_annual: 14 }),
            withCost(14_000, { funding_debt_percent: 100, financing_rate_annual: 14 }),
            withCost(12_000),
            baseStudy({ revenue_handover_percent: 20 }),
            baseStudy(),
        ];
        for (const s of cenarios) {
            const r = computeImovibMath(s);
            if (Number.isNaN(r.annualIrr)) continue;
            expect(r.annualIrr).toBeGreaterThan(-99.9);
            expect(tirEhRaiz(r)).toBe(true);
        }
    });

    it('fluxo sem troca de sinal dá TIR NaN', () => {
        const r = computeImovibMath(baseStudy({ blocks: [{ id: 'b', name: 'B', sales_price_sqm: 0, construction_cost_sqm: 4_500, units: [{ id: 'u', quantity: 10, private_area: 70, common_area: 20 }] }] }));
        expect(Number.isNaN(r.annualIrr)).toBe(true);
    });
});

describe('1.6 — ESG no modo simplificado e avisos de premissa', () => {
    const esg = { esg_initiatives: [{ id: 'e1', name: 'Solar', category: 'E', cost: 1_000_000, vgv_premium: 0, funding_discount: 0, active: true }] };

    it('custo ESG entra também no CAPEX simplificado', () => {
        const simples = { capex_mode: 'simplified', capex_simplified_cost_sqm: 4_500 };
        const sem = computeImovibMath(baseStudy(simples));
        const com = computeImovibMath(baseStudy({ ...simples, ...esg }));
        expect(com.constCostTotal).toBeCloseTo(sem.constCostTotal + 1_000_000);
        expect(com.vpl).toBeLessThan(sem.vpl);
    });

    it('recebimento que não soma 100% gera aviso', () => {
        const r = computeImovibMath(baseStudy({ revenue_handover_percent: 20 }));
        const aviso = r.avisos.find(a => a.codigo === 'recebimento_nao_soma_100');
        expect(aviso).toBeDefined();
        expect(aviso!.aba).toBe('funding');
    });

    it('estudo sem preço de venda gera aviso', () => {
        const s = baseStudy();
        s.blocks[0].sales_price_sqm = 0;
        expect(computeImovibMath(s).avisos.some(a => a.codigo === 'sem_preco')).toBe(true);
    });

    it('estudo sem área gera aviso', () => {
        expect(computeImovibMath(baseStudy({ blocks: [] })).avisos.some(a => a.codigo === 'sem_area')).toBe(true);
    });
});
