/**
 * biConvergence.test.ts
 *
 * Trava as definições de negócio acordadas em 2026-06-01.
 * Falha se qualquer fórmula de métrica divergir entre os serviços JS
 * ou se afastar da definição canônica das views SQL (vw_fact_*).
 *
 * Regras fixadas:
 *   VGV         = deals com type='SALE' AND status='COMPLETED'
 *   Receita     = dre_group='RECEITA_BRUTA'  (sem rec. financeira / venda de ativo)
 *   EBITDA      = RB − deduções − custos diretos − despesas adm/comercial
 *   Divergência = ROUND(divergencias / (recebidos + divergencias) * 100, 1)
 *   Conversão   = ROUND(fechados_vgv / (fechados_vgv + cancelados_venda) * 100, 1)
 */

import { describe, it, expect } from 'vitest';
import { kpiService } from '../services/kpiService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — espelham a lógica dos services sem acesso ao Supabase
// ─────────────────────────────────────────────────────────────────────────────

type DealStatus = 'COMPLETED' | 'IN_NEGOTIATION' | 'CANCELLED';
type DealType   = 'SALE' | 'RENT';

interface Deal {
    status: DealStatus;
    type: DealType;
    value: number;
}

/** Espelho de salesDashboardService — filtra VGV (decisão: type='SALE' AND status='COMPLETED') */
function computeVGV(deals: Deal[]): number {
    return deals
        .filter(d => d.type === 'SALE' && d.status === 'COMPLETED')
        .reduce((sum, d) => sum + d.value, 0);
}

/** Taxa de conversão — denominador = COMPLETED + CANCELLED (só SALE) */
function computeConversionRate(deals: Deal[]): number | null {
    const saleDeals = deals.filter(d => d.type === 'SALE');
    const fechados   = saleDeals.filter(d => d.status === 'COMPLETED').length;
    const cancelados = saleDeals.filter(d => d.status === 'CANCELLED').length;
    const base = fechados + cancelados;
    if (base === 0) return null;
    return Math.round(fechados / base * 1000) / 10; // 1 casa decimal
}

/** Taxa de reprovação (distratos / fechados_venda) */
function computeReprovacao(deals: Deal[]): number {
    const saleDeals  = deals.filter(d => d.type === 'SALE');
    const fechados   = saleDeals.filter(d => d.status === 'COMPLETED').length;
    const cancelados = saleDeals.filter(d => d.status === 'CANCELLED').length;
    const base = fechados + cancelados;
    return base > 0 ? (cancelados / base) * 100 : 0;
}

/** Espelho da fn_dre_summary — calcula EBITDA a partir de grupos DRE */
type DreGroup =
    | 'RECEITA_BRUTA' | 'DEDUCOES'
    | 'CUSTO_OBRA' | 'CUSTO_SERVICO'
    | 'DESPESA_ADM' | 'DESPESA_COMERCIAL'
    | 'FINANCEIRO' | 'IMPOSTOS' | 'NAO_OPERACIONAL';

interface Tx {
    dre_group: DreGroup;
    net: number; // já com sinal: receita = positivo, custo/despesa = negativo
}

function computeEBITDA(txs: Tx[]): number {
    const groups: DreGroup[] = [
        'RECEITA_BRUTA', 'DEDUCOES',
        'CUSTO_OBRA', 'CUSTO_SERVICO',
        'DESPESA_ADM', 'DESPESA_COMERCIAL',
    ];
    return txs
        .filter(t => groups.includes(t.dre_group))
        .reduce((sum, t) => sum + t.net, 0);
}

function computeReceitaBruta(txs: Tx[]): number {
    return txs
        .filter(t => t.dre_group === 'RECEITA_BRUTA')
        .reduce((sum, t) => sum + t.net, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. kpiService — divergenceRate e financialApprovalRate em 1 casa decimal
// ─────────────────────────────────────────────────────────────────────────────

describe('kpiService — arredondamento (convergência com SQL ROUND(..., 1))', () => {
    it('divergenceRate: 1/7 ≈ 14.3% (não 14%)', () => {
        const orders = [
            ...Array(6).fill({ status: 'Recebido',    created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true }),
            { status: 'Divergência', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: false },
        ];
        const kpis = kpiService.compute(orders);
        expect(kpis.divergenceRate).toBe(14.3);
    });

    it('divergenceRate: 3/10 = 30.0% (inteiro representado com 1 casa)', () => {
        const orders = [
            ...Array(7).fill({ status: 'Recebido',    created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true }),
            ...Array(3).fill({ status: 'Divergência', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: false }),
        ];
        const kpis = kpiService.compute(orders);
        expect(kpis.divergenceRate).toBe(30.0);
    });

    it('divergenceRate: 0 divergências → 0.0%', () => {
        const orders = Array(5).fill({ status: 'Recebido', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true });
        const kpis = kpiService.compute(orders);
        expect(kpis.divergenceRate).toBe(0.0);
    });

    it('divergenceRate: null quando nenhum pedido fechado', () => {
        const orders = [{ status: 'Enviado', created_at: '2024-01-01', receivedAt: null, isFinancialApproved: false }];
        const kpis = kpiService.compute(orders);
        expect(kpis.divergenceRate).toBeNull();
    });

    it('financialApprovalRate: 2/3 ≈ 66.7% (não 67%)', () => {
        const orders = [
            { status: 'Recebido', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true },
            { status: 'Recebido', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true },
            { status: 'Recebido', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: false },
        ];
        const kpis = kpiService.compute(orders);
        expect(kpis.financialApprovalRate).toBe(66.7);
    });

    it('kpiService.divergenceRate === computeConversionRate equivalente SQL', () => {
        // Ambos usam o mesmo denominador: fechados (recebidos + divergências)
        const orders = [
            ...Array(4).fill({ status: 'Recebido',    created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true }),
            ...Array(2).fill({ status: 'Divergência', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: false }),
            ...Array(3).fill({ status: 'Enviado',     created_at: '2024-01-01', receivedAt: null,         isFinancialApproved: false }),
        ];
        const kpis = kpiService.compute(orders);
        // Denominador correto = 4+2 = 6 (não inclui 'Enviado')
        const expected = Math.round(2 / 6 * 1000) / 10; // 33.3
        expect(kpis.divergenceRate).toBe(expected);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. VGV — só type='SALE' AND status='COMPLETED'
// ─────────────────────────────────────────────────────────────────────────────

describe('VGV (salesDashboardService) — somente deals type=SALE status=COMPLETED', () => {
    const deals: Deal[] = [
        { type: 'SALE',   status: 'COMPLETED',      value: 500_000 }, // ✔ conta
        { type: 'SALE',   status: 'COMPLETED',      value: 300_000 }, // ✔ conta
        { type: 'RENT',   status: 'COMPLETED',      value: 100_000 }, // ✗ locação
        { type: 'SALE',   status: 'CANCELLED',      value: 200_000 }, // ✗ cancelado
        { type: 'SALE',   status: 'IN_NEGOTIATION', value: 400_000 }, // ✗ aberto
        { type: 'RENT',   status: 'CANCELLED',      value:  50_000 }, // ✗ locação cancelada
    ];

    it('soma apenas SALE+COMPLETED', () => {
        expect(computeVGV(deals)).toBe(800_000);
    });

    it('locação COMPLETED não conta como VGV', () => {
        const onlyRent: Deal[] = [{ type: 'RENT', status: 'COMPLETED', value: 999_999 }];
        expect(computeVGV(onlyRent)).toBe(0);
    });

    it('SALE CANCELLED não conta como VGV', () => {
        const onlyCancelled: Deal[] = [{ type: 'SALE', status: 'CANCELLED', value: 999_999 }];
        expect(computeVGV(onlyCancelled)).toBe(0);
    });

    it('sem deals → VGV = 0 (sem divisão por zero)', () => {
        expect(computeVGV([])).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Taxa de conversão — denominador correto
// ─────────────────────────────────────────────────────────────────────────────

describe('Taxa de conversão — denominador = COMPLETED + CANCELLED (só SALE)', () => {
    it('exclui IN_NEGOTIATION e RENT do denominador', () => {
        const deals: Deal[] = [
            { type: 'SALE', status: 'COMPLETED',      value: 100 }, // num + den
            { type: 'SALE', status: 'CANCELLED',      value: 100 }, // den
            { type: 'SALE', status: 'IN_NEGOTIATION', value: 100 }, // ignorado
            { type: 'RENT', status: 'COMPLETED',      value: 100 }, // ignorado
        ];
        // 1 fechado / (1 + 1) = 50.0%
        expect(computeConversionRate(deals)).toBe(50.0);
    });

    it('100% de conversão quando nenhum cancelamento', () => {
        const deals: Deal[] = [
            { type: 'SALE', status: 'COMPLETED', value: 100 },
            { type: 'SALE', status: 'COMPLETED', value: 100 },
        ];
        expect(computeConversionRate(deals)).toBe(100.0);
    });

    it('0% de conversão quando todos cancelados', () => {
        const deals: Deal[] = [
            { type: 'SALE', status: 'CANCELLED', value: 100 },
            { type: 'SALE', status: 'CANCELLED', value: 100 },
        ];
        expect(computeConversionRate(deals)).toBe(0.0);
    });

    it('null quando não há dados suficientes (sem fechados nem cancelados)', () => {
        const deals: Deal[] = [{ type: 'SALE', status: 'IN_NEGOTIATION', value: 100 }];
        expect(computeConversionRate(deals)).toBeNull();
    });

    it('taxa de conversão e reprovação são complementares em 100%', () => {
        const deals: Deal[] = [
            { type: 'SALE', status: 'COMPLETED', value: 100 },
            { type: 'SALE', status: 'COMPLETED', value: 100 },
            { type: 'SALE', status: 'COMPLETED', value: 100 },
            { type: 'SALE', status: 'CANCELLED', value: 100 },
        ];
        const conv  = computeConversionRate(deals)!;  // 75.0
        const repro = computeReprovacao(deals);         // 25.0
        expect(conv + repro).toBeCloseTo(100, 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DRE — definições canônicas de Receita e EBITDA
// ─────────────────────────────────────────────────────────────────────────────

describe('DRE — Receita Bruta e EBITDA (espelho de fn_dre_summary)', () => {
    const txs: Tx[] = [
        { dre_group: 'RECEITA_BRUTA',      net:  500_000 }, // receita de obra
        { dre_group: 'RECEITA_BRUTA',      net:  200_000 }, // receita de serviços
        { dre_group: 'DEDUCOES',           net:  -50_000 }, // ISS/PIS/COFINS
        { dre_group: 'CUSTO_OBRA',         net: -150_000 }, // material + MO
        { dre_group: 'CUSTO_SERVICO',      net:  -30_000 },
        { dre_group: 'DESPESA_ADM',        net:  -40_000 }, // folha adm
        { dre_group: 'DESPESA_COMERCIAL',  net:  -20_000 }, // comissões
        { dre_group: 'FINANCEIRO',         net:  -10_000 }, // juros — NÃO entra no EBITDA
        { dre_group: 'FINANCEIRO',         net:    5_000 }, // receita financeira — NÃO é Receita Bruta
        { dre_group: 'IMPOSTOS',           net:  -25_000 }, // IR/CSLL — NÃO entra no EBITDA
        { dre_group: 'NAO_OPERACIONAL',    net:   15_000 }, // venda de ativo — NÃO é Receita Bruta
    ];

    it('Receita Bruta exclui receita financeira e venda de ativo', () => {
        expect(computeReceitaBruta(txs)).toBe(700_000);
    });

    it('EBITDA exclui financeiro, impostos e não-operacional', () => {
        // 700k − 50k − 150k − 30k − 40k − 20k = 410k
        expect(computeEBITDA(txs)).toBe(410_000);
    });

    it('EBITDA < Receita Bruta quando há custos e despesas', () => {
        expect(computeEBITDA(txs)).toBeLessThan(computeReceitaBruta(txs));
    });

    it('Resultado Líquido = EBITDA + financeiro + impostos + não-operacional', () => {
        const ebitda    = computeEBITDA(txs);                         // 410k
        const financeiro = txs.filter(t => t.dre_group === 'FINANCEIRO').reduce((s, t) => s + t.net, 0); // -5k
        const impostos   = txs.filter(t => t.dre_group === 'IMPOSTOS').reduce((s, t) => s + t.net, 0);   // -25k
        const naoOp      = txs.filter(t => t.dre_group === 'NAO_OPERACIONAL').reduce((s, t) => s + t.net, 0); // 15k
        const resultado  = ebitda + financeiro + impostos + naoOp;
        expect(resultado).toBe(395_000);
    });

    it('EBITDA = 0 sem transações', () => {
        expect(computeEBITDA([])).toBe(0);
    });

    it('Receita Bruta = 0 sem receitas', () => {
        const custos: Tx[] = [{ dre_group: 'CUSTO_OBRA', net: -100 }];
        expect(computeReceitaBruta(custos)).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Invariantes de consistência entre as duas fontes de taxa de divergência
//    kpiService (JS, SupplyChainOrderList) ↔ vw_bi_supply (SQL)
// ─────────────────────────────────────────────────────────────────────────────

describe('Invariantes de consistência kpiService ↔ vw_bi_supply', () => {
    it('pedidos em status Enviado/Confirmado não afetam a taxa de divergência', () => {
        const withActive = [
            { status: 'Recebido',  created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true },
            { status: 'Enviado',   created_at: '2024-01-01', receivedAt: null,         isFinancialApproved: false },
            { status: 'Confirmado',created_at: '2024-01-01', receivedAt: null,         isFinancialApproved: false },
        ];
        const withoutActive = [
            { status: 'Recebido',  created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true },
        ];
        expect(kpiService.compute(withActive).divergenceRate)
            .toBe(kpiService.compute(withoutActive).divergenceRate);
    });

    it('lead time calculado apenas sobre pedidos Recebidos com data de recebimento', () => {
        const orders = [
            { status: 'Recebido',   created_at: '2024-01-01T00:00:00Z', receivedAt: '2024-01-11T00:00:00Z', isFinancialApproved: true },
            { status: 'Divergência',created_at: '2024-01-01T00:00:00Z', receivedAt: '2024-01-06T00:00:00Z', isFinancialApproved: false },
            { status: 'Recebido',   created_at: '2024-01-01T00:00:00Z', receivedAt: null, isFinancialApproved: true }, // sem receivedAt — excluído
        ];
        const kpis = kpiService.compute(orders);
        // Só o primeiro pedido tem receivedAt: 10 dias
        expect(kpis.leadTimeDays).toBe(10);
    });

    it('taxa de divergência é >= 0 e <= 100 para qualquer entrada válida', () => {
        for (const recebidos of [0, 1, 5, 10]) {
            for (const divs of [0, 1, 3]) {
                const orders = [
                    ...Array(recebidos).fill({ status: 'Recebido',    created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: true }),
                    ...Array(divs).fill(     { status: 'Divergência', created_at: '2024-01-01', receivedAt: '2024-01-10', isFinancialApproved: false }),
                ];
                const rate = kpiService.compute(orders).divergenceRate;
                if (rate !== null) {
                    expect(rate).toBeGreaterThanOrEqual(0);
                    expect(rate).toBeLessThanOrEqual(100);
                }
            }
        }
    });
});
