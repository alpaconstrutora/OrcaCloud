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
        const s = estudo({ discount_rate: null, funding_debt_percent: 60 });
        const { premissas } = montarPlanilhaImovib(s, computeImovibMath(s));

        expect(premissas[0]).toEqual(['Grupo', 'Premissa', 'Valor', 'Unidade', 'Observação']);
        expect(linha(premissas, 'Duração da obra', 1)[2]).toBe(24);
        expect(linha(premissas, 'TMA', 1)[2]).toBe(12); // IMOVIB_DEFAULTS.discount_rate
        expect(linha(premissas, 'Repasse bancário / chaves', 1)[2]).toBe(70);
        expect(linha(premissas, 'Financiamento à produção / dívida', 1)[2]).toBe(60);
        const grupos = new Set(premissas.slice(1).map(l => l[0]));
        expect([...grupos]).toEqual(['Cronograma', 'Taxas', 'Perfil de recebimento', 'Financiamento']);
        for (const l of premissas.slice(1)) expect(typeof l[2]).toBe('number');
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
});
