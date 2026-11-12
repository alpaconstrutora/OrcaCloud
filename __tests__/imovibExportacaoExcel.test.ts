// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { montarPlanilhaImovib } from '../components/ImovibExecutiveSummary';

/**
 * Item 5.6 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md:
 * o Excel do Resumo Executivo ganha as abas "Indicadores" e "Premissas", com
 * valores numéricos (unidade em coluna própria) e cabeçalhos em português.
 */
const estudo = (over: Record<string, any> = {}): any => ({
    id: 'estudo-teste',
    name: 'Estudo teste',
    construction_duration_months: 24,
    sales_duration_months: 24,
    construction_start_month: 6,
    sales_start_month: 1,
    inflation_rate: 0,
    discount_rate: 15,
    tax_rate: 4,
    brokerage_fee: 5,
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

const linha = (tabela: (string | number | null)[][], rotulo: string, col = 0) => {
    const l = tabela.find(r => r[col] === rotulo);
    if (!l) throw new Error(`linha "${rotulo}" não encontrada`);
    return l;
};

describe('montarPlanilhaImovib — abas do Excel do Resumo Executivo', () => {
    it('Indicadores: números do MESMO cálculo da tela, como número', () => {
        const s = estudo();
        const m = computeImovibMath(s);
        const { indicadores } = montarPlanilhaImovib(s, m);

        expect(indicadores[0]).toEqual(['Indicador', 'Valor', 'Unidade', 'Observação']);
        expect(linha(indicadores, 'VGV bruto')[1]).toBe(m.vgvTotal);
        expect(linha(indicadores, 'VGV líquido')[1]).toBe(m.netVgvTotal);
        expect(linha(indicadores, 'Custo de obra')[1]).toBe(m.constCostTotal);
        expect(linha(indicadores, 'Terreno')[1]).toBe(5_000_000);
        expect(linha(indicadores, 'VPL')[1]).toBe(m.vpl);
        expect(linha(indicadores, 'TIR')[1]).toBe(m.annualIrr);
        expect(linha(indicadores, 'Exposição máxima de caixa')[1]).toBe(m.maxExposure);
        expect(linha(indicadores, 'TMA')[1]).toBe(15);
        expect(linha(indicadores, 'Duração')[1]).toBe(m.duration);
        // Nenhum valor vira texto formatado ("R$ 1.234") dentro da célula.
        for (const l of indicadores.slice(1)) expect(l[1] === null || typeof l[1] === 'number').toBe(true);
    });

    it('Premissas: cronograma, taxas, recebimento e financiamento; vazio usa o padrão do motor', () => {
        const s = estudo({ discount_rate: null, funding_debt_percent: 60, premise_notes: { discount_rate: { fonte: 'Comitê de investimento', data: '2026-11-01' } } });
        const { premissas } = montarPlanilhaImovib(s, computeImovibMath(s));

        // Item 10.1: a aba sai do memorial, com a fonte e a data de cada premissa.
        expect(premissas[0]).toEqual(['Grupo', 'Premissa', 'Valor', 'Unidade', 'Observação', 'Fonte', 'Data']);
        expect(linha(premissas, 'TMA', 1).slice(5)).toEqual(['Comitê de investimento', '2026-11-01']);
        expect(linha(premissas, 'Duração da obra', 1)[2]).toBe(24);
        expect(linha(premissas, 'TMA', 1)[2]).toBe(12); // IMOVIB_DEFAULTS.discount_rate
        expect(linha(premissas, 'Repasse bancário / chaves', 1)[2]).toBe(70);
        expect(linha(premissas, 'Financiamento à produção / dívida', 1)[2]).toBe(60);
        const grupos = new Set(premissas.slice(1).map(l => l[0]));
        expect([...grupos]).toEqual(['Cronograma', 'Terreno', 'Custos', 'Taxas', 'Curva de vendas', 'Perfil de recebimento', 'Distrato', 'Índices', 'Financiamento', 'Jurídico']);
        // Número em toda premissa, exceto as que são escolha (texto) e as opcionais sem padrão (vazias).
        const ESCOLHAS = ['Tipo da curva', 'Revender a unidade distratada', 'Juros do financiamento na obra', 'Amortização do financiamento', 'Regime tributário',
            'Pagamento do terreno', 'Modo do CAPEX', 'Curva de desembolso da obra', 'Alíquotas do regime', 'Patrimônio de afetação'];
        const OPCIONAIS = ['Data-base', 'Aprovação do projeto', 'Registro da incorporação', 'Custo/m² do CAPEX simplificado', 'Área do CAPEX simplificado',
            'Pesos da curva de desembolso', 'Pesos da curva de vendas'];
        for (const l of premissas.slice(1)) {
            if (ESCOLHAS.includes(String(l[1]))) expect(typeof l[2]).toBe('string');
            else if (OPCIONAIS.includes(String(l[1]))) expect(l[2] === null || typeof l[2] === 'number' || typeof l[2] === 'string', String(l[1])).toBe(true);
            else expect(typeof l[2], String(l[1])).toBe('number');
        }
    });

    it('4.1 e 4.2 — regras do financiamento nas Premissas; capital próprio NECESSÁRIO (R$) nos Indicadores, sem o % digitado', () => {
        const s = estudo({ funding_debt_percent: 60, financing_min_sales_percent: 30, financing_interest_mode: 'paga_mensal' });
        const m = computeImovibMath(s);
        const { premissas, indicadores } = montarPlanilhaImovib(s, m);
        expect(linha(premissas, 'Vendas mínimas para liberar', 1)[2]).toBe(30);
        expect(linha(premissas, 'Defasagem da liberação', 1)[2]).toBe(0);
        expect(linha(premissas, 'Juros do financiamento na obra', 1)[2]).toBe('Pagos todo mês');
        expect(linha(premissas, 'Amortização do financiamento', 1)[2]).toBe('Toda a receita líquida');
        expect(linha(premissas, 'Caixa mínimo', 1)[2]).toBe(0);
        expect(premissas.some(l => l[1] === 'Capital próprio (equity)')).toBe(false);
        expect(linha(indicadores, 'Capital próprio necessário')[1]).toBe(m.capital.proprio);
        expect(linha(indicadores, 'Financiamento liberado')[1]).toBe(m.capital.divida);
        expect(linha(indicadores, 'Permuta')[1]).toBe(m.capital.permuta);
        expect(linha(indicadores, 'Outras fontes de capital')[1]).toBe(m.capital.terceiros);
        expect(linha(indicadores, 'Vendas durante a obra')[1]).toBe(m.capital.vendasNaObra);
    });

    it('4.3 — aba Aportes: uma linha por mês, e distribuições menos aportes é o lucro', () => {
        const s = estudo();
        const m = computeImovibMath(s);
        const { aportes } = montarPlanilhaImovib(s, m);
        expect(aportes[0]).toEqual(['Mês', 'Aporte (R$)', 'Distribuição (R$)', 'Para as fontes por participação (R$)', 'Caixa no fim do mês (R$)']);
        expect(aportes.length).toBe(m.duration + 1);
        const soma = (c: number) => aportes.slice(1).reduce((a, l) => a + (l[c] as number), 0);
        expect(soma(2) - soma(1)).toBeCloseTo(m.monthlyFlows.reduce((a, f) => a + f.net, 0), 2);
    });

    it('4.4 — cada outra fonte entra nas Premissas com o valor e como é paga', () => {
        const fonte = { id: 'f1', study_id: 'estudo-teste', name: 'Mútuo do sócio', kind: 'mutuo', amount: 1_000_000, entry_month: 3, remuneration: 'juros', rate_annual: 12, profit_share_percent: null, amortization: 'BULLET', term_months: 24, grace_months: 0, sort_order: 0 };
        const s = estudo({ funding_sources: [fonte] });
        const { premissas } = montarPlanilhaImovib(s, computeImovibMath(s));
        const l = linha(premissas, 'Mútuo do sócio', 1);
        expect(l[0]).toBe('Outras fontes');
        expect(l[2]).toBe(1_000_000);
        expect(l[4]).toMatch(/mês 3.*12% a\.a\..*24 meses/);
    });

    it('6.3 — regime tributário nas Premissas; fora do manual, o imposto da Dinâmica diz que não entra', () => {
        const s = estudo({ tax_regime: 'ret', tax_hypotheses: { retPct: 2 } });
        const { premissas } = montarPlanilhaImovib(s, computeImovibMath(s));
        const l = linha(premissas, 'Regime tributário', 1);
        expect(l[2]).toBe('RET (patrimônio de afetação)');
        expect(l[4]).toMatch(/2% da receita/);
        expect(linha(premissas, 'Impostos sobre a receita', 1)[4]).toMatch(/regime/);
        expect(linha(montarPlanilhaImovib(estudo(), computeImovibMath(estudo())).premissas, 'Regime tributário', 1)[2]).toBe('Manual (rubricas de imposto ou Dinâmica)');
    });

    it('4.5 — a origem da TMA sai na linha da TMA', () => {
        const s = estudo({ discount_rate_basis: 'CDI + 4 p.p. (custo de oportunidade do sócio)' });
        const { premissas, indicadores } = montarPlanilhaImovib(s, computeImovibMath(s));
        expect(linha(premissas, 'TMA', 1)[4]).toBe('CDI + 4 p.p. (custo de oportunidade do sócio)');
        expect(linha(indicadores, 'TMA')[3]).toBe('CDI + 4 p.p. (custo de oportunidade do sócio)');
    });

    it('fluxo sem troca de sinal: TIR vazia com o motivo, não NaN na célula', () => {
        const s = estudo({ blocks: [] });
        const m = computeImovibMath(s);
        const tir = linha(montarPlanilhaImovib(s, m).indicadores, 'TIR');
        expect(Number.isFinite(m.annualIrr)).toBe(false);
        expect(tir[1]).toBeNull();
        expect(tir[3]).toMatch(/Sem TIR/);
    });

    it('Fluxo de caixa: uma linha por mês, cabeçalho em português', () => {
        const s = estudo();
        const m = computeImovibMath(s);
        const { fluxo } = montarPlanilhaImovib(s, m);
        expect(fluxo[0][0]).toBe('Mês do projeto');
        expect(fluxo.length).toBe(m.monthlyFlows.length + 1);
    });

    it('2.5 — Indicadores: indicadores de decisão e pontos de equilíbrio, como número', () => {
        const s = estudo();
        const m = computeImovibMath(s);
        const { indicadores } = montarPlanilhaImovib(s, m);
        for (const rotulo of ['Lucro líquido', 'Margem líquida sobre o VGV', 'Payback simples', 'Payback descontado', 'Múltiplo do capital',
            'Retorno sobre o capital', 'TIR modificada', 'Mês da exposição máxima', 'VPL do projeto', 'TIR do projeto',
            'Valor máximo do terreno (VPL zero)', 'Terreno para margem de 15%', 'Variação de preço que zera o VPL',
            'Variação do custo de obra que zera o VPL', 'Vendas mínimas', 'Estoque não vendido']) {
            const l = linha(indicadores, rotulo);
            expect(l[1] === null || typeof l[1] === 'number', rotulo).toBe(true);
        }
        expect(linha(indicadores, 'Lucro líquido')[1]).toBeCloseTo(m.monthlyFlows.reduce((a, f) => a + f.net, 0), 4);
        expect(linha(indicadores, 'VPL do projeto')[1]).toBe(m.vplProjeto);
    });

    it('2.5 — Premissas da Fase 1 entram com o padrão do motor', () => {
        const s = estudo();
        const { premissas } = montarPlanilhaImovib(s, computeImovibMath(s));
        expect(linha(premissas, 'Tipo da curva', 1)[2]).toBe('Linear');
        expect(linha(premissas, 'Deságio da revenda', 1)[2]).toBe(10);
        expect(linha(premissas, 'Revender a unidade distratada', 1)[2]).toBe('Sim');
        expect(linha(premissas, 'Intermediárias', 1)[2]).toBe(0);
    });

    it('2.5 — Fluxo de caixa: uma coluna por linha e as colunas do projeto; as linhas somam o caixa', () => {
        const s = estudo({ funding_debt_percent: 50 });
        const m = computeImovibMath(s);
        const { fluxo } = montarPlanilhaImovib(s, m);
        const cab = fluxo[0];
        const col = (nome: string) => cab.indexOf(nome);
        expect(col('Sinal (R$)')).toBeGreaterThan(0);
        expect(col('Liberação da dívida (R$)')).toBeGreaterThan(0);
        expect(col('Caixa do projeto (R$)')).toBeGreaterThan(0);
        const primeiraLinha = col('Sinal (R$)');
        const ultimaLinha = col('Remuneração de terceiros (R$)');
        fluxo.slice(1).forEach((l, i) => {
            const somaLinhas = (l.slice(primeiraLinha, ultimaLinha + 1) as number[]).reduce((a, b) => a + b, 0);
            expect(somaLinhas).toBeCloseTo(m.monthlyFlows[i].net, 4);
            expect(l[col('Caixa do projeto (R$)')]).toBeCloseTo(m.monthlyFlows[i].netProjeto, 6);
        });
    });
});

describe('Excel (pendência da Fase 2) — nenhuma célula com NaN ou infinito', () => {
    // `typeof NaN === 'number'`: a checagem "é número" deixava NaN passar.
    const finitas = (nome: string, tabelas: Record<string, (string | number | null)[][]>) => {
        for (const [aba, linhas] of Object.entries(tabelas)) {
            for (const l of linhas) for (const c of l) {
                if (typeof c === 'number') expect(Number.isFinite(c), `${nome} › ${aba} › ${String(l[0])}/${String(l[1])}`).toBe(true);
            }
        }
    };

    it('estudo normal, estudo sem torres (sem VGV, sem TIR) e estudo com dívida', () => {
        for (const [nome, s] of [
            ['normal', estudo()],
            ['sem torres', estudo({ blocks: [] })],
            ['com dívida', estudo({ funding_debt_percent: 80, financing_rate_annual: 14 })],
        ] as const) {
            finitas(nome, montarPlanilhaImovib(s, computeImovibMath(s)) as unknown as Record<string, (string | number | null)[][]>);
        }
    });
});
