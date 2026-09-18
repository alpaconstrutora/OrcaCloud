/**
 * `financialService.syncOrderToFinance` — o produtor das parcelas de pedido.
 * Pedido de 17/09/2026, docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md
 *
 * Até aqui ele gravava em `internal_transactions` sem `purchase_order_id`:
 * a coluna existia desde 20261221000001 e ficou NULL em 100% das linhas. E
 * como `financialSyncService` faz upsert do JSON da obra pelo mesmo
 * `reference_id`, cada re-sync rebaixava a parcela para 'PROJECT' e apagava o
 * fornecedor. Medido em produção: 12 de 12 parcelas de pedido sem origem, sem
 * fornecedor, sem vínculo — invisíveis para o Portal do Fornecedor.
 *
 * O que estes casos travam é o contrato entre produtor e consumidor
 * (`purchase_order_financeiro_json`, que filtra SÓ por `purchase_order_id`):
 *   1. toda parcela leva `purchase_order_id`;
 *   2. `reference_id` continua sendo o id do tx do JSON — de propósito, porque
 *      é por ele que o espelho faz upsert; composto aqui duplicaria o título;
 *   3. o tx do JSON leva `supplierId`, que é o que o espelho copia para
 *      `supplier_id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PEDIDO = 'e74427c6-4b21-429f-accb-889f3c4d2d55';
const PROJETO = 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392';
const FORNECEDOR = '1a360a59-c6b0-40b3-b367-cd8b146d3744';

const inseridos: Record<string, unknown>[] = [];
const apagados: { tabela: string; filtros: Record<string, unknown> }[] = [];
let projetoSalvo: { settings: { financialInfo: { transactions: Record<string, unknown>[] } } } | null = null;
/** Transações que já existem no JSON da obra quando o sync roda. */
let transacoesExistentes: Record<string, unknown>[] = [];

const pedido = {
    id: PEDIDO, number: 'PO-551252', status: 'Recebido',
    supplier_id: FORNECEDOR, project_id: PROJETO,
    items: [{ total: 300 }, { total: 261.25 }],
    actual_delivery_date: '2026-03-12', delivery_date: '2026-03-10',
    payment_method: 'Boleto', payment_term_type: 'Parcelado',
    payment_installments: 3, payment_days: 30,
    bank_account: 'Itaú', cost_center: 'CC-1', chart_of_accounts: 'Materiais',
};

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: () => ({
                eq: () => ({
                    single: async () => {
                        if (tabela === 'purchase_orders') return { data: { ...pedido }, error: null };
                        if (tabela === 'suppliers') return { data: { name: 'MCC' }, error: null };
                        return { data: null, error: null };
                    },
                }),
            }),
            insert: async (linha: Record<string, unknown>) => {
                if (tabela === 'internal_transactions') inseridos.push(linha);
                return { error: null };
            },
            delete: () => {
                const filtros: Record<string, unknown> = {};
                const encadeavel = {
                    eq: (k: string, v: unknown) => { filtros[k] = v; return encadeavel; },
                    then: (resolve: (r: { error: null }) => void) => {
                        apagados.push({ tabela, filtros });
                        resolve({ error: null });
                    },
                };
                return encadeavel;
            },
        }),
    },
}));

vi.mock('../services/projectService', () => ({
    projectService: {
        loadProject: async () => ({
            id: PROJETO,
            name: 'Garden',
            settings: {
                organizationId: 'org1',
                financialInfo: { transactions: projetoSalvo?.settings.financialInfo.transactions ?? transacoesExistentes },
            },
        }),
        saveProject: async (p: typeof projetoSalvo) => { projetoSalvo = p; return p; },
    },
}));

vi.mock('../services/invoiceService', () => ({
    invoiceService: { listInvoicesByOrder: async () => [{ id: 'nf1', fileName: 'nfe.xml' }] },
}));
vi.mock('../utils/systemProjects', () => ({ isSystemProject: () => false }));

import { financialService } from '../services/financialService';

describe('syncOrderToFinance · a parcela precisa ser ACHÁVEL pelo pedido', () => {
    beforeEach(() => {
        inseridos.length = 0;
        apagados.length = 0;
        projetoSalvo = null;
        transacoesExistentes = [];
    });

    it('gera uma linha por parcela, com purchase_order_id em todas', async () => {
        await financialService.syncOrderToFinance(PEDIDO);
        expect(inseridos).toHaveLength(3);
        inseridos.forEach(l => expect(l.purchase_order_id).toBe(PEDIDO));
    });

    it('reference_id continua sendo o id do tx do JSON — é por ele que o espelho faz upsert', async () => {
        await financialService.syncOrderToFinance(PEDIDO);
        const idsNoJson = new Set(
            projetoSalvo!.settings.financialInfo.transactions.map(t => t.id as string),
        );
        inseridos.forEach(l => expect(idsNoJson.has(String(l.reference_id))).toBe(true));
        // Composto ("<pedido>:p1") faria o upsert do espelho NÃO achar a linha e
        // criar uma segunda — título duplicado.
        inseridos.forEach(l => expect(String(l.reference_id)).not.toContain(PEDIDO));
    });

    it('carimba origem PURCHASE_ORDER e fornecedor no razão', async () => {
        await financialService.syncOrderToFinance(PEDIDO);
        inseridos.forEach(l => {
            expect(l.source_system).toBe('PURCHASE_ORDER');
            expect(l.supplier_id).toBe(FORNECEDOR);
            expect(l.party_type).toBe('SUPPLIER');
            expect(l.party_name).toBe('MCC');
        });
    });

    it('o tx do JSON leva supplierId — é o que o espelho da obra copia para supplier_id', async () => {
        await financialService.syncOrderToFinance(PEDIDO);
        projetoSalvo!.settings.financialInfo.transactions.forEach(t => {
            expect(t.orderId).toBe(PEDIDO);
            expect(t.supplierId).toBe(FORNECEDOR);
        });
    });

    it('a última parcela absorve o resíduo: soma exata ao total do pedido', async () => {
        await financialService.syncOrderToFinance(PEDIDO);
        const soma = inseridos.reduce((acc, l) => acc + Number(l.amount), 0);
        expect(Math.round(soma * 100) / 100).toBe(561.25);
    });

    it('re-sync com parcelas PENDING limpa o razão do pedido antes de regerar', async () => {
        transacoesExistentes = [
            { id: 'tx-antigo', orderId: PEDIDO, status: 'PENDING', value: 1, date: '2026-01-01', type: 'EXPENSE' },
        ];
        await financialService.syncOrderToFinance(PEDIDO);
        expect(apagados).toEqual([
            { tabela: 'internal_transactions', filtros: { purchase_order_id: PEDIDO, status: 'PENDING' } },
        ]);
        expect(inseridos).toHaveLength(3);
    });

    it('parcela já baixada: não apaga nada e não regera', async () => {
        transacoesExistentes = [
            { id: 'tx-pago', orderId: PEDIDO, status: 'PAID', value: 1, date: '2026-01-01', type: 'EXPENSE' },
        ];
        await financialService.syncOrderToFinance(PEDIDO);
        expect(apagados).toHaveLength(0);
        expect(inseridos).toHaveLength(0);
    });
});
