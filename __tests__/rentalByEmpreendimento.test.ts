import { describe, it, expect } from 'vitest';
import {
    groupRentalAnalysis,
    empreendimentoOfProperty,
    empreendimentoOfContract,
    SEM_EMPREENDIMENTO,
    type AnalysisProperty,
    type AnalysisDeal,
    type AnalysisContract,
    type EmpreendimentoRef,
} from '../lib/rentalByEmpreendimento';
import type { StatusEvent } from '../lib/rentalVacancy';

/**
 * A garantia que estes testes existem para proteger é aritmética: **a soma das
 * linhas por empreendimento tem que fechar com o total do topo da aba Análise**.
 * Quando ela quebra, o usuário vê a tabela contradizendo os KPIs logo acima e
 * perde a confiança nos dois — foi o que aconteceu com patrimônio × receita
 * antes da Fase 0 do plano de KPIs de Locação.
 */

const AURORA: EmpreendimentoRef = { id: 'emp-aurora', name: 'Residencial Aurora' };
const VITORIA: EmpreendimentoRef = { id: 'emp-vitoria', name: 'Edifício Vitória' };

// Carteira: 2 edifícios vinculados (2 unidades cada) + 1 galpão avulso sem
// vínculo nenhum. O galpão é o que exercita o balde "Sem empreendimento".
const properties: AnalysisProperty[] = [
    { id: 'b-aurora', parent_id: null, status: 'AVAILABLE', price: 0 },
    { id: 'u-a1', parent_id: 'b-aurora', status: 'RENTED', price: 400000, rental_price: 2000 },
    { id: 'u-a2', parent_id: 'b-aurora', status: 'AVAILABLE', price: 300000, rental_price: 1500 },
    { id: 'b-vitoria', parent_id: null, status: 'AVAILABLE', price: 0 },
    { id: 'u-v1', parent_id: 'b-vitoria', status: 'RENTED', price: 250000, rental_price: 1200 },
    { id: 'u-v2', parent_id: 'b-vitoria', status: 'AVAILABLE', price: 250000, rental_price: 0 },
    { id: 'galpao', parent_id: null, status: 'RENTED', price: 900000, rental_price: 8000 },
];

// Só o EDIFÍCIO é vinculado; as unidades herdam dele. É o caso comum do espelho
// de locações publicado antes de as unidades ganharem `rental_property_id`.
const empreendimentoByProperty: Record<string, EmpreendimentoRef> = {
    'b-aurora': AURORA,
    'b-vitoria': VITORIA,
};

const deals: AnalysisDeal[] = [
    { id: 'd-a1', type: 'RENTAL', status: 'COMPLETED', property_id: 'u-a1', value: 2000, installment_value: 1900 },
    { id: 'd-v1', type: 'RENTAL', status: 'COMPLETED', property_id: 'u-v1', value: 1200, installment_value: 1200 },
    { id: 'd-g', type: 'RENTAL', status: 'COMPLETED', property_id: 'galpao', value: 8000, installment_value: 7500 },
    // Em negociação: não entra na receita mensal (mesma base do KPI do topo).
    { id: 'd-a2', type: 'RENTAL', status: 'IN_NEGOTIATION', property_id: 'u-a2', value: 1500, installment_value: 1500 },
];

const contratadoPorImovel: Record<string, number> = {
    'u-a1': 1900,
    'u-v1': 1200,
    'galpao': 7500,
};

const baseInput = {
    properties,
    deals,
    empreendimentoByProperty,
    rentalValueOf: (p: AnalysisProperty) =>
        p.rental_price != null ? Number(p.rental_price) : Number(p.price ?? 0),
    contractedValueOf: (id: string) => contratadoPorImovel[id] ?? 0,
    now: new Date('2026-08-12T12:00:00'),
};

describe('empreendimentoOfProperty', () => {
    const byId = new Map(properties.map(p => [p.id, p]));

    it('unidade sem vínculo próprio herda o empreendimento do edifício', () => {
        expect(empreendimentoOfProperty(properties[1], byId, empreendimentoByProperty))
            .toEqual(AURORA);
    });

    it('imóvel sem vínculo em nenhum nível devolve null', () => {
        const galpao = properties.find(p => p.id === 'galpao')!;
        expect(empreendimentoOfProperty(galpao, byId, empreendimentoByProperty)).toBeNull();
    });

    it('não trava com parent_id circular', () => {
        const ciclo: AnalysisProperty[] = [
            { id: 'x', parent_id: 'y' },
            { id: 'y', parent_id: 'x' },
        ];
        const mapaCiclo = new Map(ciclo.map(p => [p.id, p]));
        expect(empreendimentoOfProperty(ciclo[0], mapaCiclo, {})).toBeNull();
    });
});

describe('empreendimentoOfContract', () => {
    it('contrato-FILHO de renovação, sem deal_id, herda pela cadeia de pais', () => {
        const pai: AnalysisContract = { id: 'c-pai', deal_id: 'd-a1' };
        const filho: AnalysisContract = { id: 'c-filho', deal_id: null, parent_contract_id: 'c-pai' };
        const neto: AnalysisContract = { id: 'c-neto', deal_id: null, parent_contract_id: 'c-filho' };
        const byId = new Map([pai, filho, neto].map(c => [c.id, c]));
        const porDeal = new Map([['d-a1', AURORA]]);

        expect(empreendimentoOfContract(neto, byId, porDeal)).toEqual(AURORA);
    });

    it('contrato sem deal_id e sem pai devolve null', () => {
        const orfao: AnalysisContract = { id: 'c-orfao' };
        expect(empreendimentoOfContract(orfao, new Map([['c-orfao', orfao]]), new Map())).toBeNull();
    });
});

describe('groupRentalAnalysis — a soma das linhas fecha com o total', () => {
    const contracts: AnalysisContract[] = [
        { id: 'c-a1', deal_id: 'd-a1', status: 'Ativo', end_date: '2028-01-31', current_value: 1900 },
        // Renovação do de cima: sem deal_id, só parent_contract_id.
        { id: 'c-a1-r', deal_id: null, parent_contract_id: 'c-a1', status: 'Ativo', end_date: '2029-01-31', current_value: 2100, renewal_seq: 1 },
        { id: 'c-v1', deal_id: 'd-v1', status: 'Ativo', end_date: '2027-06-30', current_value: 1200 },
        { id: 'c-g', deal_id: 'd-g', status: 'Ativo', end_date: '2030-12-31', current_value: 7500 },
    ];

    const receivablesByContract = new Map([
        ['c-a1', [{ amount: 1900, due_date: '2026-01-10', settled: false }]],
        ['c-v1', [{ amount: 1200, due_date: '2026-08-10', settled: true }]],
    ]);

    const vacancyEvents: StatusEvent[] = [
        { property_id: 'u-a2', from_status: 'RENTED', to_status: 'AVAILABLE', changed_at: '2026-06-12T00:00:00Z', source: 'APP' },
        { property_id: 'u-v2', from_status: 'RENTED', to_status: 'AVAILABLE', changed_at: '2026-07-13T00:00:00Z', source: 'APP' },
    ];

    // NOI por imóvel no formato que rentalNoiService devolve (rollup já feito).
    const noiByProperty = new Map([
        ['b-aurora', { propertyId: 'b-aurora', ownRevenue: 0, ownExpense: 500, revenue: 1900, expense: 500, noi: 1400, margin: null }],
        ['b-vitoria', { propertyId: 'b-vitoria', ownRevenue: 0, ownExpense: 200, revenue: 1200, expense: 200, noi: 1000, margin: null }],
        ['galpao', { propertyId: 'galpao', ownRevenue: 7500, ownExpense: 1000, revenue: 7500, expense: 1000, noi: 6500, margin: null }],
    ]);

    const { rows, total } = groupRentalAnalysis({
        ...baseInput,
        contracts,
        receivablesByContract,
        vacancyEvents,
        noiByProperty,
    });

    const soma = (pega: (r: typeof rows[number]) => number) =>
        rows.reduce((acc, r) => acc + pega(r), 0);

    it('cria um balde por empreendimento mais o "Sem empreendimento"', () => {
        expect(rows.map(r => r.empreendimentoId).sort()).toEqual(
            [SEM_EMPREENDIMENTO, 'emp-aurora', 'emp-vitoria'].sort(),
        );
    });

    it('unidades locáveis somam o total (o edifício não conta duas vezes)', () => {
        expect(soma(r => r.unitsCount)).toBe(total.unitsCount);
        expect(total.unitsCount).toBe(5);   // 4 unidades + o galpão avulso
    });

    it('receita mensal contratada soma o total', () => {
        expect(soma(r => r.monthlyRevenue)).toBeCloseTo(total.monthlyRevenue, 6);
        expect(total.monthlyRevenue).toBe(1900 + 1200 + 7500);
    });

    it('patrimônio soma o total mesmo com rollup pelo edifício', () => {
        expect(soma(r => r.portfolioValue)).toBeCloseTo(total.portfolioValue, 6);
    });

    it('NOI soma o total', () => {
        expect(soma(r => r.noi?.noi ?? 0)).toBeCloseTo(total.noi?.noi ?? 0, 6);
    });

    it('unidades vagas somam o total', () => {
        expect(soma(r => r.vacancy?.vacantCount ?? 0)).toBe(total.vacancy?.vacantCount ?? 0);
    });

    it('contratos somam o total, com a renovação no mesmo balde do contrato de origem', () => {
        expect(soma(r => r.executive?.contractsConsidered ?? 0)).toBe(total.executive?.contractsConsidered ?? 0);
        const aurora = rows.find(r => r.empreendimentoId === 'emp-aurora')!;
        expect(aurora.executive?.contractsConsidered).toBe(2);   // o original e a renovação sem deal_id
    });

    it('imóvel sem vínculo cai no balde "Sem empreendimento", e ele fica por último', () => {
        expect(rows[rows.length - 1].empreendimentoId).toBe(SEM_EMPREENDIMENTO);
        expect(rows[rows.length - 1].monthlyRevenue).toBe(7500);
    });

    it('ocupação é taxa por balde, não soma', () => {
        const aurora = rows.find(r => r.empreendimentoId === 'emp-aurora')!;
        expect(aurora.unitsCount).toBe(2);
        expect(aurora.occupancyRate).toBeCloseTo(0.5, 6);
    });

    it('unidade sem aluguel de referência é contada e fica fora da ocupação financeira', () => {
        const vitoria = rows.find(r => r.empreendimentoId === 'emp-vitoria')!;
        expect(vitoria.financial.withoutPrice).toBe(1);          // u-v2 sem rental_price
        expect(vitoria.financial.rate).toBeCloseTo(1, 6);
    });
});

describe('groupRentalAnalysis — "não medido" nunca vira zero', () => {
    // Sem o log de status, sem despesa por imóvel e sem contratos, os três
    // blocos têm que ficar `null` — a tela mostra "—". Devolver zero aqui faria
    // a aba afirmar "0 dias de vacância" e "NOI R$ 0,00" sobre uma carteira que
    // nunca foi medida.
    it('sem log de status, sem NOI e sem contratos, os blocos ficam null', () => {
        const { rows, total } = groupRentalAnalysis(baseInput);
        expect(total.vacancy).toBeNull();
        expect(total.noi).toBeNull();
        expect(total.executive).toBeNull();
        for (const r of rows) {
            expect(r.vacancy).toBeNull();
            expect(r.noi).toBeNull();
            expect(r.executive).toBeNull();
        }
    });

    it('com contratos, mas nenhum no balde, não afirma WALE nem inadimplência', () => {
        // Um único contrato, do Aurora: os outros dois baldes têm `executive`
        // (a lista de contratos existe) mas sem base para as taxas.
        const { byId } = groupRentalAnalysis({
            ...baseInput,
            contracts: [{ id: 'c-a1', deal_id: 'd-a1', status: 'Ativo', end_date: '2028-01-31', current_value: 1900 }],
        });
        const vitoria = byId.get('emp-vitoria')!;
        expect(vitoria.executive?.contractsConsidered).toBe(0);
        expect(vitoria.executive?.wale.years).toBeNull();
        expect(vitoria.executive?.collection.overdue90Rate).toBeNull();
        expect(vitoria.executive?.renewal.rate).toBeNull();

        expect(byId.get('emp-aurora')!.executive?.wale.years).not.toBeNull();
    });
});
