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
    orcadoDoOrcamento,
    ratio,
    ratioPct,
    servicoPrimeirosMeses,
    type SnapshotInputs,
} from '../utils/creditRoomSnapshot';

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
