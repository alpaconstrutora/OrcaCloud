/**
 * Snapshot e indicadores do Credit Room — o que o banco vai ler.
 *
 * O que estes testes protegem: que a falta de dado apareça como `null` (e não
 * como um LTV de 0% "sem risco"), que o DSCR só conte fluxo elegível (R8), que
 * o haircut reduza a cobertura (R9) e que o snapshot não mude depois de
 * congelado (R2).
 */

import { describe, expect, it } from 'vitest';
import {
    buildSnapshot,
    computeIndicators,
    diasDeAtraso,
    orcadoDoOrcamento,
    ratio,
    ratioPct,
    servicoPrimeirosMeses,
    type SnapshotCapacidade,
    type SnapshotInputs,
} from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../utils/creditCapacity';

const base: SnapshotInputs = {
    dataBase: '2026-09-07',
    operacao: {
        requestedAmount: 10_000_000,
        termMonths: 60,
        graceMonths: 12,
        modality: 'FINANCIAMENTO_PRODUCAO',
        purpose: 'Construção',
        institutionName: 'Banco ABC',
        eligibleFlows: { noi: true, receivables: false, operating_cash: false },
        guarantees: [
            { kind: 'IMOVEL', description: 'Terreno', value: 8_000_000, haircut_pct: 30 },
            { kind: 'RECEBIVEIS', value: 4_000_000, haircut_pct: 50 },
        ],
        equityCommitted: 12_000_000,
        equityContributed: 6_000_000,
    },
    novoServico12m: 1_500_000,
    empreendimento: { id: 'emp-1', name: 'Residencial Vista', endereco_city: 'Campinas', endereco_state: 'SP' },
    divida: {
        dataBase: '2026-09-07',
        dividaTotal: 5_000_000, curtoPrazo: 1_000_000, longoPrazo: 4_000_000,
        encargosAPagar: 100_000, servico90: 400_000, servico365: 1_400_000, vencido: 0,
        custoMedioMensal: 1.2, prazoMedioMeses: 36, nContratos: 2, nInstituicoes: 2,
    },
    obra: {
        projectId: 'p-1', projectName: 'Obra Vista', orcado: 40_000_000,
        contratadoCusto: 25_000_000, pago: 15_000_000, aPagar: 10_000_000, vencidoPagar: 0,
        avancoFisicoPct: 38.4,
    },
    unidades: [
        { status: 'VENDIDO', price: 500_000 },
        { status: 'VENDIDO', price: 500_000 },
        { status: 'PERMUTADO', price: 400_000 },
        { status: 'RESERVADO', price: 450_000 },
        { status: 'DISPONIVEL', price: 550_000 },
        { status: 'DISPONIVEL', price: 600_000 },
    ],
    portfolio: { janelaMeses: 12, receita: 2_400_000, despesa: 600_000, noi: 1_800_000, margem: 75, capRate: 8.1 },
    documentVersionIds: ['v-1', 'v-2'],
};

describe('helpers', () => {
    it('ratio/ratioPct devolvem null quando o denominador não existe ou é zero', () => {
        expect(ratio(10, 0)).toBeNull();
        expect(ratio(10, null)).toBeNull();
        expect(ratio(null, 10)).toBeNull();
        expect(ratioPct(25, 100)).toBe(25);
        expect(ratio(3, 2)).toBe(1.5);
    });

    it('orçado usa a fórmula canônica (qty·preço·(1+bdi)), com bdi do item vencendo o padrão', () => {
        const budget = [
            { quantity: 10, sinapiItem: { price: 100 } },            // bdi padrão 20 → 1.200
            { quantity: 2, bdi: 0, sinapiItem: { price: 50 } },      // bdi 0 → 100
            { quantity: 5 },                                          // sem preço → 0
        ];
        expect(orcadoDoOrcamento(budget, 20)).toBe(1300);
        expect(orcadoDoOrcamento(null, 20)).toBe(0);
    });

    it('serviço dos primeiros meses soma só as N primeiras parcelas e é null sem cronograma', () => {
        const parcelas = Array.from({ length: 24 }, (_, i) => ({ total: i < 12 ? 100 : 999 }));
        expect(servicoPrimeirosMeses(parcelas)).toBe(1200);
        expect(servicoPrimeirosMeses([])).toBeNull();
    });
});

describe('buildSnapshot', () => {
    it('congela vendas por status e VGV vendido = vendidas + permutadas', () => {
        const s = buildSnapshot(base);
        expect(s.vendas).toMatchObject({
            unidades_total: 6, vendidas: 2, permutadas: 1, reservadas: 1, disponiveis: 2,
            vgv_total: 3_000_000, vgv_vendido: 1_400_000, vgv_disponivel: 1_150_000,
        });
        expect(s.vendas?.pct_vendido).toBe(46.67);
    });

    it('portfólio vem rotulado como CONTRATADA (R7) e com NOI mensal derivado da janela', () => {
        const s = buildSnapshot(base);
        expect(s.portfolio?.base).toBe('CONTRATADA');
        expect(s.portfolio?.noi_mensal).toBe(150_000);
    });

    it('margem e cap rate saem em PERCENTUAL, não na fração que o rentalNoiService devolve', () => {
        // O serviço devolve `margin = noi/revenue` (0,9962) e `capRate` igual.
        // Congelar cru fazia a tela mostrar "1%" para uma carteira de 99,6% —
        // número plausível na frente de um banco. Achado no passeio de 07/09.
        const s = buildSnapshot({
            ...base,
            portfolio: { janelaMeses: 12, receita: 211_328, despesa: 803, noi: 210_525, margem: 0.9962, capRate: 0.081 },
        });
        expect(s.portfolio?.margem_pct).toBe(99.62);
        expect(s.portfolio?.cap_rate_pct).toBe(8.1);
    });

    it('margem e cap rate ausentes seguem null — não viram 0%', () => {
        const s = buildSnapshot({
            ...base,
            portfolio: { janelaMeses: 12, receita: 0, despesa: 0, noi: 0, margem: null, capRate: null },
        });
        expect(s.portfolio?.margem_pct).toBeNull();
        expect(s.portfolio?.cap_rate_pct).toBeNull();
    });

    it('bloco sem vínculo fica null — não zero', () => {
        const s = buildSnapshot({ ...base, obra: null, unidades: null, portfolio: null, divida: null, empreendimento: null });
        expect(s.obra).toBeNull();
        expect(s.vendas).toBeNull();
        expect(s.portfolio).toBeNull();
        expect(s.divida).toBeNull();
        expect(s.empreendimento).toBeNull();
    });

    it('R2 — mutar a entrada depois não altera o snapshot', () => {
        const inputs = structuredClone(base);
        const s = buildSnapshot(inputs);
        inputs.operacao.guarantees[0].value = 1;
        inputs.operacao.guarantees.push({ kind: 'AVAL', value: 999, haircut_pct: 0 });
        inputs.documentVersionIds.push('v-3');
        expect(s.operacao.guarantees).toHaveLength(2);
        expect(s.operacao.guarantees[0].value).toBe(8_000_000);
        expect(s.documentos.version_ids).toEqual(['v-1', 'v-2']);
    });
});

describe('aging de recebíveis (PRD §25)', () => {
    // data-base 2026-09-07. Uma parcela por faixa, mais as duas bordas.
    const parcelas = [
        { dueDate: '2026-10-01', amount: 100_000, settlementStatus: 'LANCADA' },   // futuro  → a vencer
        { dueDate: '2026-09-07', amount: 50_000, settlementStatus: 'LANCADA' },    // HOJE    → a vencer
        { dueDate: '2026-09-06', amount: 10_000, settlementStatus: 'NAO_LANCADA' },// 1 dia   → 1–30
        { dueDate: '2026-08-08', amount: 20_000, settlementStatus: 'LANCADA' },    // 30 dias → 1–30
        { dueDate: '2026-08-07', amount: 30_000, settlementStatus: 'LANCADA' },    // 31 dias → 31–60
        { dueDate: '2026-07-08', amount: 40_000, settlementStatus: 'LANCADA' },    // 61 dias → 61–90
        { dueDate: '2026-05-01', amount: 60_000, settlementStatus: 'LANCADA' },    // 129 dias→ +90
        { dueDate: '2026-06-01', amount: 500_000, settlementStatus: 'RECEBIDA' },  // fora do aberto
        { dueDate: '2026-06-01', amount: 999_999, settlementStatus: 'CANCELADA' }, // descartada
    ];

    it('distribui pelas cinco faixas do PRD e separa o recebido', () => {
        const s = buildSnapshot({ ...base, recebiveis: { escopo: 'OBRA', parcelas } });
        expect(s.recebiveis).toMatchObject({
            a_vencer: 150_000,          // futuro + hoje
            vencido_1_30: 30_000,       // 1 dia + 30 dias
            vencido_31_60: 30_000,
            vencido_61_90: 40_000,
            vencido_90_mais: 60_000,
            total_em_aberto: 310_000,
            recebido: 500_000,          // NÃO entra no em aberto (R6)
            n_parcelas_abertas: 7,
            n_parcelas_vencidas: 5,
        });
    });

    it('parcela que vence NA data-base conta como a vencer, não como vencida', () => {
        const s = buildSnapshot({
            ...base,
            recebiveis: { escopo: 'OBRA', parcelas: [{ dueDate: '2026-09-07', amount: 1000, settlementStatus: 'LANCADA' }] },
        });
        expect(s.recebiveis?.a_vencer).toBe(1000);
        expect(s.recebiveis?.n_parcelas_vencidas).toBe(0);
    });

    it('inadimplência é o vencido sobre o em aberto — e null sem carteira', () => {
        const comAtraso = buildSnapshot({ ...base, recebiveis: { escopo: 'OBRA', parcelas } });
        expect(comAtraso.recebiveis?.inadimplencia_pct).toBe(51.61);   // 160/310

        const soRecebido = buildSnapshot({
            ...base,
            recebiveis: { escopo: 'ORGANIZACAO', parcelas: [{ dueDate: '2026-01-01', amount: 900, settlementStatus: 'RECEBIDA' }] },
        });
        expect(soRecebido.recebiveis?.total_em_aberto).toBe(0);
        expect(soRecebido.recebiveis?.inadimplencia_pct).toBeNull();
    });

    it('o aging é medido contra a DATA-BASE da versão, não contra hoje', () => {
        // A mesma parcela: vencida em relação a setembro, futura em relação a julho.
        const r = { escopo: 'OBRA' as const, parcelas: [{ dueDate: '2026-08-01', amount: 7000, settlementStatus: 'LANCADA' }] };
        const set = buildSnapshot({ ...base, dataBase: '2026-09-07', recebiveis: r });
        const jul = buildSnapshot({ ...base, dataBase: '2026-07-01', recebiveis: r });
        expect(set.recebiveis?.vencido_31_60).toBe(7000);
        expect(jul.recebiveis?.a_vencer).toBe(7000);
    });

    it('sem recebível o bloco é null — a tela diz "sem dado", não "R$ 0,00"', () => {
        expect(buildSnapshot({ ...base, recebiveis: null }).recebiveis).toBeNull();
    });

    it('diasDeAtraso não escorrega no fuso (a armadilha do new Date(YYYY-MM-DD))', () => {
        expect(diasDeAtraso('2026-09-07', '2026-09-07')).toBe(0);
        expect(diasDeAtraso('2026-09-06', '2026-09-07')).toBe(1);
        expect(diasDeAtraso('2026-10-01', '2026-09-07')).toBe(-24);
        // Virada de mês e ano, onde o erro de fuso costuma aparecer.
        expect(diasDeAtraso('2025-12-31', '2026-01-01')).toBe(1);
    });
});

describe('computeIndicators', () => {
    it('LTC, LTV, equity e cobertura com todos os insumos', () => {
        const ind = computeIndicators(buildSnapshot(base));
        expect(ind.divida_atual).toBe(5_000_000);
        expect(ind.divida_pos).toBe(15_000_000);
        expect(ind.ltc_atual).toBe(12.5);            // 5 / 40
        expect(ind.ltc_pos).toBe(37.5);              // 15 / 40
        expect(ind.garantias_brutas).toBe(12_000_000);
        expect(ind.garantias_elegiveis).toBe(7_600_000); // 8M·0,7 + 4M·0,5
        expect(ind.ltv_pos).toBe(125);               // 15 / 12
        expect(ind.cobertura_pos).toBe(0.51);        // 7,6 / 15
        expect(ind.equity_pct).toBe(15);             // 6 / 40
        expect(ind.equity_previsto_pct).toBe(30);
        expect(ind.pct_vendido).toBe(46.67);
    });

    it('LTC é null com custo total zero — nunca 0%', () => {
        const ind = computeIndicators(buildSnapshot({ ...base, obra: { ...base.obra!, orcado: 0 } }));
        expect(ind.custo_total).toBeNull();
        expect(ind.ltc_atual).toBeNull();
        expect(ind.ltc_pos).toBeNull();
        expect(ind.equity_pct).toBeNull();
    });

    it('LTV e cobertura são null sem garantia cadastrada', () => {
        const ind = computeIndicators(buildSnapshot({
            ...base, operacao: { ...base.operacao, guarantees: [] },
        }));
        expect(ind.garantias_brutas).toBeNull();
        expect(ind.ltv_atual).toBeNull();
        expect(ind.cobertura_atual).toBeNull();
    });

    it('R9 — haircut reduz a cobertura, não o LTV (LTV é sobre o bruto)', () => {
        const semHaircut = computeIndicators(buildSnapshot({
            ...base, operacao: { ...base.operacao, guarantees: base.operacao.guarantees.map(g => ({ ...g, haircut_pct: 0 })) },
        }));
        const comHaircut = computeIndicators(buildSnapshot(base));
        expect(semHaircut.ltv_pos).toBe(comHaircut.ltv_pos);
        expect(comHaircut.cobertura_pos!).toBeLessThan(semHaircut.cobertura_pos!);
        expect(semHaircut.cobertura_pos).toBe(0.8);  // 12 / 15
    });

    it('DSCR usa NOI anualizado ÷ serviço; pós-operação soma o serviço da proposta', () => {
        const ind = computeIndicators(buildSnapshot(base));
        expect(ind.fluxo_elegivel_anual).toBe(1_800_000);
        expect(ind.dscr_atual).toBe(1.29);          // 1,8 / 1,4
        expect(ind.servico_pos_anual).toBe(2_900_000);
        expect(ind.dscr_pos).toBe(0.62);            // 1,8 / 2,9
        expect(ind.fontes_ausentes).toEqual([]);
    });

    it('R8 — fluxo não marcado como elegível fica fora do DSCR mesmo existindo no snapshot', () => {
        const ind = computeIndicators(buildSnapshot({
            ...base, operacao: { ...base.operacao, eligibleFlows: { noi: false, receivables: false, operating_cash: false } },
        }));
        expect(ind.fluxo_elegivel_anual).toBeNull();
        expect(ind.dscr_atual).toBeNull();
        expect(ind.dscr_pos).toBeNull();
    });

    it('fluxo marcado como elegível sem fonte vira aviso, não zero', () => {
        const ind = computeIndicators(buildSnapshot({
            ...base,
            portfolio: null,
            operacao: { ...base.operacao, eligibleFlows: { noi: true, receivables: true, operating_cash: false } },
        }));
        expect(ind.fluxo_elegivel_anual).toBeNull();
        expect(ind.dscr_atual).toBeNull();
        expect(ind.fontes_ausentes).toEqual(['noi', 'receivables']);
    });

    it('DSCR pós-operação é null sem cronograma da proposta — não estima por valor ÷ prazo', () => {
        const ind = computeIndicators(buildSnapshot({ ...base, novoServico12m: null }));
        expect(ind.dscr_atual).toBe(1.29);
        expect(ind.servico_pos_anual).toBeNull();
        expect(ind.dscr_pos).toBeNull();
    });
});

// ── Schema 2: capacidade de pagamento pela série mensal ──────────────────────

/** Indicadores que a versão 1 produzia para `base` — copiados do `computeIndicators`
 *  ANTES de o schema 2 existir. Se este objeto mudar, versões congeladas passaram a
 *  mostrar outro número para o banco. */
const INDICADORES_SCHEMA1_ESPERADOS = {
    divida_atual: 5000000,
    divida_pos: 15000000,
    custo_total: 40000000,
    ltc_atual: 12.5,
    ltc_pos: 37.5,
    garantias_brutas: 12000000,
    garantias_elegiveis: 7600000,
    ltv_atual: 41.67,
    ltv_pos: 125,
    cobertura_atual: 1.52,
    cobertura_pos: 0.51,
    equity_pct: 15,
    equity_previsto_pct: 30,
    fluxo_elegivel_anual: 1800000,
    servico_atual_anual: 1400000,
    servico_pos_anual: 2900000,
    dscr_atual: 1.29,
    dscr_pos: 0.62,
    pct_vendido: 46.67,
    fontes_ausentes: [],
};

const serie12 = (over: Partial<SerieMes> = {}): SerieMes[] =>
    Array.from({ length: 12 }, (_, i) => ({
        mes: `2026-${String(i + 1).padStart(2, '0')}`,
        vendas: 6_000, alugueis: 4_000, despesa_operacional: 0,
        renda_liquida: 10_000, servico_atual: 5_000, servico_novo: 0,
        folga: 5_000, dscr: 2,
        ...over,
    }));

const capacidadeBase = (serie: SerieMes[] = serie12()): SnapshotCapacidade => ({
    fonte: 'creditCapacity',
    data_base: '2026-09-07',
    parametros: { ...PARAMETROS_CAPACIDADE_PADRAO },
    base: 'CONTRATADA',
    serie,
    recebido_12m: [],
    vencido_na_data_base: 0,
    a_vencer_mes_corrente: 0,
    estoque: null,
    capacidade_maxima: { parcela_maxima: 0, valor_maximo: 0 },
    alertas: [],
    por_organizacao: [],
});

describe('schema 2', () => {
    it('buildSnapshot grava schema 2', () => {
        expect(buildSnapshot(base).schema).toBe(2);
    });

    it('blocos novos sem fonte ficam null — não zero nem vazio', () => {
        const s = buildSnapshot(base);
        expect(s.escopo).toBeNull();
        expect(s.empreendimentos).toBeNull();
        expect(s.contratos).toBeNull();
        expect(s.capacidade).toBeNull();
        expect(s.qualidade).toBeNull();
    });

    it('schema 1 congelado continua com os mesmos indicadores', () => {
        const v1 = { ...buildSnapshot(base), schema: 1 as const };
        delete (v1 as any).capacidade;
        expect(computeIndicators(v1)).toEqual(INDICADORES_SCHEMA1_ESPERADOS);
    });

    it('com capacidade, DSCR sai da série e não soma NOI de novo', () => {
        const s = buildSnapshot({
            ...base,
            portfolio: { ...base.portfolio!, noi: 99_999 * 12, janelaMeses: 12 },   // noi_mensal 99.999 — deve ser ignorado
            capacidade: capacidadeBase(),
        });
        const ind = computeIndicators(s);
        expect(ind.fluxo_elegivel_anual).toBe(120_000);     // 12 × 10.000
        expect(ind.servico_atual_anual).toBe(60_000);       // 12 × 5.000 (não o servico_365 da dívida)
        expect(ind.dscr_atual).toBe(2);
    });

    it('só os 12 primeiros meses da série entram na conta', () => {
        const serie = [...serie12(), ...serie12({ renda_liquida: 777_000, servico_atual: 555_000 })];
        const ind = computeIndicators(buildSnapshot({ ...base, capacidade: capacidadeBase(serie) }));
        expect(ind.fluxo_elegivel_anual).toBe(120_000);
        expect(ind.servico_atual_anual).toBe(60_000);
    });

    it('serviço pós soma o novo da série; é null sem série de serviço novo E sem proposta', () => {
        const comNovo = computeIndicators(buildSnapshot({
            ...base, capacidade: capacidadeBase(serie12({ servico_novo: 2_500 })),
        }));
        expect(comNovo.servico_pos_anual).toBe(90_000);     // 12 × (5.000 + 2.500)
        expect(comNovo.dscr_pos).toBe(1.33);                // 120 / 90

        const semNada = computeIndicators(buildSnapshot({
            ...base, novoServico12m: null, capacidade: capacidadeBase(),
        }));
        expect(semNada.servico_pos_anual).toBeNull();
        expect(semNada.dscr_pos).toBeNull();

        // Proposta com cronograma, mesmo que a série ainda não carregue o novo serviço:
        // soma o da proposta — DSCR pós não pode sair igual ao atual (otimista).
        const comProposta = computeIndicators(buildSnapshot({
            ...base, novoServico12m: 1_500_000, capacidade: capacidadeBase(),
        }));
        expect(comProposta.servico_pos_anual).toBe(60_000 + 1_500_000);
        expect(comProposta.dscr_pos).toBe(0.08);            // 120.000 / 1.560.000
    });

    it('schema 2 com capacidade null dá os mesmos indicadores do caminho antigo (NOI × 12)', () => {
        const s = buildSnapshot({ ...base, capacidade: null });
        expect(s.schema).toBe(2);
        expect(computeIndicators(s)).toEqual(INDICADORES_SCHEMA1_ESPERADOS);
    });

    it('série vazia não vira DSCR de zero — fluxo e serviço ficam null', () => {
        const ind = computeIndicators(buildSnapshot({ ...base, capacidade: capacidadeBase([]) }));
        expect(ind.fluxo_elegivel_anual).toBeNull();
        expect(ind.servico_atual_anual).toBeNull();
        expect(ind.dscr_atual).toBeNull();
    });

    it('receivables e noi marcados com capacidade não aparecem em fontes_ausentes', () => {
        const ind = computeIndicators(buildSnapshot({
            ...base,
            portfolio: null,
            operacao: { ...base.operacao, eligibleFlows: { noi: true, receivables: true, operating_cash: true } },
            capacidade: capacidadeBase(),
        }));
        expect(ind.fontes_ausentes).toEqual(['operating_cash']);
    });

    it('buildSnapshot congela capacidade por valor (mutar a entrada não muda o snapshot)', () => {
        const capacidade = capacidadeBase();
        const s = buildSnapshot({ ...base, capacidade });
        capacidade.serie[0].renda_liquida = 1;
        capacidade.serie.pop();
        capacidade.alertas.push({ tipo: 'LOCACAO_SEM_VALOR', qtd: 1, valor: 1 });
        expect(s.capacidade!.serie).toHaveLength(12);
        expect(s.capacidade!.serie[0].renda_liquida).toBe(10_000);
        expect(s.capacidade!.alertas).toEqual([]);
    });

    it('buildSnapshot congela escopo, empreendimentos, contratos e qualidade por valor', () => {
        const escopo = { fonte: 'organizations', data_base: '2026-09-07', tipo: 'GRUPO' as const, organizacoes: [{ id: 'o1', nome: 'SPE A', cnpj: null }] };
        const qualidade = { fonte: 'creditCapacity', data_base: '2026-09-07', concentracao_top5_pct: 40, wale_anos: 2, locacoes_prazo_indeterminado: 0, pontualidade_12m_pct: 90 };
        const s = buildSnapshot({ ...base, escopo, qualidade });
        escopo.organizacoes[0].nome = 'mudou';
        qualidade.wale_anos = 99;
        expect(s.escopo!.organizacoes[0].nome).toBe('SPE A');
        expect(s.qualidade!.wale_anos).toBe(2);
    });
});
