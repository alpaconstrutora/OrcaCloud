import { describe, it, expect } from 'vitest';
import { computeImovibMath, calcularTirMensal } from '../hooks/useImovibMath';
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

    it('fluxo com uma troca de sinal: a raiz única', () => {
        const t = calcularTirMensal([-100, 110]);
        expect(t.raizes).toBe(1);
        expect(t.taxa).toBeCloseTo(0.1, 8);
    });

    it('fluxo + → − → + com duas raízes (10% e 20%): devolve a menor e conta as duas', () => {
        // 100 − 230/(1+r) + 132/(1+r)² = 0 → r = 10% ou 20%. Os extremos da busca
        // têm o MESMO sinal — a 1ª versão da correção só olhava os extremos e dava NaN.
        const t = calcularTirMensal([100, -230, 132]);
        expect(t.raizes).toBe(2);
        expect(t.taxa).toBeCloseTo(0.1, 8);
    });

    it('sem raiz no intervalo: NaN', () => {
        expect(Number.isNaN(calcularTirMensal([-100, -10]).taxa)).toBe(true);
        expect(Number.isNaN(calcularTirMensal([100, -1, 100]).taxa)).toBe(true); // VPL > 0 em toda taxa
    });

    it('estudo com sinal de venda antes da obra e terreno zero (formato do Garden Cambuhy) tem TIR', () => {
        // Meses 1–5: só sinal (positivo); 6–29: obra (negativo); 29: repasse (positivo).
        const r = computeImovibMath(baseStudy({ land_cost: 0 }));
        const net = r.monthlyFlows.map(f => f.net);
        expect(net[0]).toBeGreaterThan(0);
        expect(Math.min(...net)).toBeLessThan(0);
        expect(Number.isFinite(r.annualIrr)).toBe(true);
        expect(tirEhRaiz(r)).toBe(true);
    });

    it('fluxo sem troca de sinal dá TIR NaN', () => {
        const r = computeImovibMath(baseStudy({ blocks: [{ id: 'b', name: 'B', sales_price_sqm: 0, construction_cost_sqm: 4_500, units: [{ id: 'u', quantity: 10, private_area: 70, common_area: 20 }] }] }));
        expect(Number.isNaN(r.annualIrr)).toBe(true);
    });
});

describe('2.2 — rubricas do CAPEX detalhado entram no cálculo', () => {
    const rubrica = (category: string, name: string, value_type: 'currency' | 'percent', value: number, base?: string) =>
        ({ id: name, study_id: 'estudo-teste', category, name, value_type, value, base, created_at: '', updated_at: '' });

    // R$ 100 mil fixos de obra, 3% sobre o terreno, 2% sobre a obra, 5% sobre o VGV.
    const itens = [
        rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra'),
        rubrica('1. Terreno', 'ITBI', 'percent', 3, 'terreno'),
        rubrica('9. Contingência', 'Reserva', 'percent', 2, 'obra'),
        rubrica('7. Impostos', 'Regime normal', 'percent', 5, 'vgv'),
    ];
    const acc = (r: ReturnType<typeof computeImovibMath>) => r.monthlyFlows[r.monthlyFlows.length - 1].acc;

    it('soma cada rubrica sobre a sua base e substitui imposto + corretagem da Dinâmica', () => {
        // tax_rate 4 e brokerage 5 do estudo-base NÃO podem entrar.
        const r = computeImovibMath(baseStudy({ capex_items: itens }));
        const obra = 40 * 90 * 4_500;
        const totalRev = sum(r.monthlyFlows.map(f => f.rev));
        const esperado = totalRev * 0.95 - (5_000_000 + 0.03 * 5_000_000 + obra + 0.02 * obra + 100_000);
        expect(r.capexRubricasAtivas).toBe(true);
        expect(acc(r)).toBeCloseTo(esperado, 2);
        expect(r.capexRubricas.terreno).toBeCloseTo(150_000);
        expect(r.capexRubricas.obra).toBeCloseTo(100_000 + 0.02 * obra);
        expect(r.capexRubricas.vgv).toBeCloseTo(totalRev * 0.05);
    });

    it('rubrica de terreno sai no mês 1', () => {
        const r = computeImovibMath(baseStudy({ capex_items: [rubrica('1. Terreno', 'ITBI', 'percent', 3, 'terreno')] }));
        expect(r.monthlyFlows[0].cost).toBeCloseTo(5_000_000 * 1.03);
    });

    it('rubrica em R$ com base vgv sai ao longo das vendas', () => {
        const r = computeImovibMath(baseStudy({ capex_items: [rubrica('5. Marketing e Vendas', 'Stand', 'currency', 240_000, 'vgv')] }));
        // 24 meses de vendas a partir do mês 1 → R$ 10 mil/mês somados ao custo.
        const semRubrica = computeImovibMath(baseStudy({ tax_rate: 0, brokerage_fee: 0 }));
        expect(r.monthlyFlows[0].cost - semRubrica.monthlyFlows[0].cost).toBeCloseTo(10_000);
        expect(r.capexRubricas.vgv).toBeCloseTo(240_000);
    });

    it('valor por rubrica soma o total do motor, inclusive com inflação', () => {
        const comFixoVgv = [...itens, rubrica('5. Marketing e Vendas', 'Stand', 'currency', 240_000, 'vgv')];
        const r = computeImovibMath(baseStudy({ capex_items: comFixoVgv, inflation_rate: 0.5 }));
        const soma = sum(Object.values(r.capexValorPorRubrica));
        expect(soma).toBeCloseTo(r.capexRubricas.total, 2);
        expect(r.capexValorPorRubrica['Stand']).toBeGreaterThan(240_000); // corrigido pela inflação
    });

    it('sem a coluna base (linha antiga), deduz pela categoria', () => {
        const comBase = computeImovibMath(baseStudy({ capex_items: itens }));
        const semBase = computeImovibMath(baseStudy({ capex_items: itens.map(i => ({ ...i, base: undefined })) }));
        expect(semBase.vpl).toBeCloseTo(comBase.vpl, 2);
    });

    it('modo simplificado ignora as rubricas', () => {
        const simples = { capex_mode: 'simplified', capex_simplified_cost_sqm: 4_500 };
        const com = computeImovibMath(baseStudy({ ...simples, capex_items: itens }));
        const sem = computeImovibMath(baseStudy(simples));
        expect(com.capexRubricasAtivas).toBe(false);
        expect(com.vpl).toBeCloseTo(sem.vpl, 2);
    });

    it('sem rubricas cadastradas, valem imposto e corretagem da Dinâmica', () => {
        const r = computeImovibMath(baseStudy({ capex_items: [] }));
        expect(r.capexRubricasAtivas).toBe(false);
        const totalRev = sum(r.monthlyFlows.map(f => f.rev));
        const totalCost = sum(r.monthlyFlows.map(f => f.cost));
        expect(acc(r)).toBeCloseTo(totalRev * (1 - 0.09) - totalCost, 2);
    });
});

describe('3.2 — VGV: espelho de vendas, senão preço/m² do bloco', () => {
    const inst = (id: string, block_id: string, price: number, status = 'DISPONÍVEL', private_area = 70) =>
        ({ id, study_id: 'estudo-teste', block_id, name: id, floor: 1, private_area, position_type: 'LATERAL', sun_orientation: 'NORTE', price, status, created_at: '', updated_at: '' });

    it('sem espelho: área privativa vendável × preço/m²', () => {
        const r = computeImovibMath(baseStudy());
        expect(r.vgvBase).toBeCloseTo(40 * 70 * 10_000);
        expect(r.vgvPorBloco['b1']).toEqual({ vgv: 40 * 70 * 10_000, fonte: 'preco_m2' });
    });

    it('tipologia não vendável (área comum) entra no custo, não no VGV', () => {
        const s = baseStudy();
        s.blocks[0].units.push({ id: 'u2', quantity: 1, private_area: 300, common_area: 0, is_vendavel: false });
        const r = computeImovibMath(s);
        expect(r.vgvBase).toBeCloseTo(40 * 70 * 10_000);
        expect(r.constCostTotal).toBeCloseTo((40 * 90 + 300) * 4_500);
    });

    it('com espelho: soma o preço de cada unidade; sem preço vale área × preço/m²; permutada fica fora', () => {
        const r = computeImovibMath(baseStudy({
            unit_instances: [
                inst('a', 'b1', 800_000),
                inst('b', 'b1', 0),                    // sem preço → 70 m² × 10.000
                inst('c', 'b1', 900_000, 'PERMUTADO'), // fora do VGV
                inst('d', 'b1', 750_000, 'VENDIDO'),
            ],
        }));
        expect(r.vgvPorBloco['b1']).toEqual({ vgv: 800_000 + 700_000 + 750_000, fonte: 'espelho' });
        expect(r.vgvBase).toBeCloseTo(2_250_000);
    });

    it('bloco com espelho e bloco sem espelho somam cada um pela sua regra', () => {
        const s = baseStudy({ unit_instances: [inst('a', 'b1', 1_000_000)] });
        s.blocks.push({ id: 'b2', name: 'Torre B', sales_price_sqm: 5_000, construction_cost_sqm: 4_500,
            units: [{ id: 'u3', quantity: 10, private_area: 50, common_area: 10 }] });
        const r = computeImovibMath(s);
        expect(r.vgvPorBloco['b1'].fonte).toBe('espelho');
        expect(r.vgvPorBloco['b2']).toEqual({ vgv: 10 * 50 * 5_000, fonte: 'preco_m2' });
        expect(r.vgvBase).toBeCloseTo(1_000_000 + 2_500_000);
    });

    it('permutada no espelho + Permuta Física preenchida = aviso de permuta em dobro', () => {
        const r = computeImovibMath(baseStudy({ swap_physical_percent: 10, unit_instances: [inst('c', 'b1', 900_000, 'PERMUTADO'), inst('a', 'b1', 800_000)] }));
        expect(r.avisos.some(a => a.codigo === 'permuta_em_dobro')).toBe(true);
    });
});

describe('5.2 — financiamento: um campo só', () => {
    const acc = (r: ReturnType<typeof computeImovibMath>) => r.monthlyFlows[r.monthlyFlows.length - 1].acc;

    it('Financ. à Produção = 0 vale 0 mesmo com o "% Financiado" antigo preenchido', () => {
        const proprio = computeImovibMath(baseStudy());
        const legadoIgnorado = computeImovibMath(baseStudy({ funding_debt_percent: 0, financing_percent: 80 }));
        expect(acc(legadoIgnorado)).toBeCloseTo(acc(proprio), 2);
        expect(legadoIgnorado.debtPayoffAtEnd).toBe(0);
    });

    it('Financ. à Produção vazio: o "% Financiado" antigo ainda vale (estudo anterior ao campo)', () => {
        const s = baseStudy({ financing_percent: 80, financing_rate_annual: 30 });
        delete s.funding_debt_percent;
        const comLegado = computeImovibMath(s);
        const proprio = computeImovibMath(baseStudy());
        expect(acc(comLegado)).toBeLessThan(acc(proprio)); // juros de 30% a.a. pesam
    });
});

describe('1.6 — avisos de premissa', () => {
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
