/**
 * Fornecedor LOGADO: lê pela view estreita, escreve pela RPC.
 * Pedido "corrigir" de 17/09/2026 — docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md (Pedido 2)
 *
 * Desde aplicar_20270921000027 a policy de SELECT de `purchase_orders` é só
 * do comprador: RLS não corta coluna, e a linha crua levava conta de
 * pagamento, centro de custo, plano de contas, aprovação e cadeia de alçada
 * ao fornecedor. O que estes casos travam é a ROTA no cliente:
 *   1. `listOrders` com fornecedor consulta a RPC `pedidos_do_fornecedor`, não a tabela;
 *   2. `getOrderById` cai na RPC quando a tabela não devolve;
 *   3. `updateAsSupplier` vai pela RPC `purchase_order_update_as_supplier`;
 *   4. `forbidden` (gestor em "Visualizar como") cai no `updateOrder` normal;
 *   5. `nfeService.approveAndLink` grava `purchase_order_id`, `due_date` e `business_status`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const consultas: { tabela: string; op: string; args?: unknown }[] = [];
const rpcs: { fn: string; args: unknown }[] = [];
const inseridos: { tabela: string; linha: Record<string, unknown> }[] = [];
let rpcResposta: unknown = { valid: true, data: { id: 'o1', number: 'PO-1', status: 'Confirmado', items: [] } };
let linhaDaTabela: Record<string, unknown> | null = null;
let linhaDaView: Record<string, unknown> | null = { id: 'o1', number: 'PO-1', status: 'Enviado', items: [], supplier_id: 'sup1', project_id: 'pr' };

function query(tabela: string) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
        select: (cols: string) => { consultas.push({ tabela, op: 'select', args: cols }); return q; },
        order: chain, in: chain, eq: chain, neq: chain, single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: tabela === 'purchase_orders' ? linhaDaTabela : linhaDaView, error: null }),
        insert: (linha: Record<string, unknown>) => {
            inseridos.push({ tabela, linha });
            const r = { select: () => r, single: async () => ({ data: { id: 'tx1' }, error: null }), then: (res: (v: unknown) => void) => res({ error: null }) };
            return r;
        },
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'nfe1' }, error: null }) }), then: (res: (v: unknown) => void) => res({ error: null }) }) }),
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => query(tabela),
        rpc: (fn: string, args: unknown) => {
            rpcs.push({ fn, args });
            // `pedidos_do_fornecedor` é SETOF: encadeia select/eq/order como tabela.
            if (fn === 'pedidos_do_fornecedor') return query('rpc:pedidos_do_fornecedor');
            return Promise.resolve({ data: fn === 'purchase_order_update_as_supplier' ? rpcResposta : {}, error: null });
        },
    },
}));
vi.mock('../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'name' }), interpolateEmailSubject: () => '', interpolateEmailBody: () => '' } }));
vi.mock('../services/notificationService', () => ({ notificationService: { sendNotification: async () => {} } }));
vi.mock('../services/supplierService', () => ({ supplierService: { getById: async () => null }, getSupplierDisplayName: (s: { name: string }) => s.name }));
vi.mock('../services/financialService', () => ({ financialService: { syncOrderToFinance: async () => {} } }));
vi.mock('../services/webhookService', () => ({ webhookService: {} }));
vi.mock('../services/projectService', () => ({ projectService: {} }));
vi.mock('../services/receiptService', () => ({ receiptService: {} }));
vi.mock('../services/discrepancyService', () => ({ discrepancyService: {} }));
vi.mock('../services/notificationLogService', () => ({ notificationLogService: { log: () => {} } }));
vi.mock('../services/whatsappService', () => ({ whatsappService: {} }));
vi.mock('../services/approvalService', () => ({ approvalService: {} }));
vi.mock('../services/orderNumberingService', () => ({ generateOrderNumber: async () => 'PO-X' }));
vi.mock('../services/processService', () => ({ processService: {} }));

import { orderService } from '../services/orderService';

describe('orderService — fornecedor logado', () => {
    beforeEach(() => { consultas.length = 0; rpcs.length = 0; linhaDaTabela = null; });

    it('listOrders com fornecedor consulta a RPC estreita, nunca a tabela', async () => {
        await orderService.listOrders(undefined, 'sup1', 'mcc@x.com');
        const tabelas = consultas.filter(c => c.op === 'select').map(c => c.tabela);
        expect(tabelas).toContain('rpc:pedidos_do_fornecedor');
        expect(tabelas).not.toContain('purchase_orders');
        const cols = String(consultas.find(c => c.tabela === 'rpc:pedidos_do_fornecedor')!.args);
        ['bank_account', 'cost_center', 'chart_of_accounts', 'plano_de_contas_id', 'is_financial_approved'].forEach(c =>
            expect(cols).not.toContain(c));
    });

    it('listOrders sem fornecedor (comprador) continua na tabela', async () => {
        await orderService.listOrders();
        expect(consultas.filter(c => c.op === 'select').map(c => c.tabela)).toContain('purchase_orders');
    });

    it('getOrderById cai na RPC estreita quando a tabela não devolve (RLS)', async () => {
        const o = await orderService.getOrderById('o1');
        expect(o?.id).toBe('o1');
        expect(consultas.map(c => c.tabela)).toEqual(['purchase_orders', 'rpc:pedidos_do_fornecedor']);
    });

    it('updateAsSupplier vai pela RPC com os campos certos', async () => {
        const o = await orderService.updateAsSupplier('o1', { status: 'Confirmado', shippedDate: '2026-09-20' }, 3);
        expect(rpcs).toHaveLength(1);
        expect(rpcs[0].fn).toBe('purchase_order_update_as_supplier');
        expect(rpcs[0].args).toMatchObject({ p_order_id: 'o1', p_status: 'Confirmado', p_shipped_date: '2026-09-20', p_expected_version: 3, p_quotes: null });
        expect(o?.status).toBe('Confirmado');
        expect(consultas.filter(c => c.tabela === 'purchase_orders' && c.op === 'select')).toHaveLength(0);
    });

    it('conflito de versão vira erro legível', async () => {
        rpcResposta = { valid: false, reason: 'conflict' };
        await expect(orderService.updateAsSupplier('o1', { status: 'Confirmado' }, 1)).rejects.toThrow(/alterado por outra pessoa/);
        rpcResposta = { valid: true, data: { id: 'o1', number: 'PO-1', status: 'Confirmado', items: [] } };
    });

    it('forbidden (gestor em "Visualizar como") cai no updateOrder normal', async () => {
        rpcResposta = { valid: false, reason: 'forbidden' };
        linhaDaTabela = { id: 'o1', number: 'PO-1', status: 'Enviado', version: 1, items: [] };
        await orderService.updateAsSupplier('o1', { status: 'Confirmado' }, 1).catch(() => null);
        // O caminho do comprador lê a TABELA (pre-flight do updateOrder).
        expect(consultas.some(c => c.tabela === 'purchase_orders' && c.op === 'select')).toBe(true);
        rpcResposta = { valid: true, data: { id: 'o1', number: 'PO-1', status: 'Confirmado', items: [] } };
    });
});

import { approveAndLink } from '../services/nfeService';

describe('nfeService.approveAndLink — o título nasce achável e com vencimento', () => {
    beforeEach(() => {
        inseridos.length = 0;
        linhaDaTabela = null;
    });

    it('grava purchase_order_id, due_date e business_status nas duas partidas', async () => {
        // A nota vem por `.single()` — ajusta o mock só para nfe_invoices.
        const mod = await import('../lib/supabase');
        const fromOrig = mod.supabase.from;
        (mod.supabase as { from: (t: string) => unknown }).from = (tabela: string) => {
            const q = fromOrig(tabela) as Record<string, unknown>;
            if (tabela === 'nfe_invoices') {
                (q as { single: () => Promise<unknown> }).single = async () => ({
                    data: { id: 'nfe1', linked_transaction_id: null, document_status: 'active', total_value: 100, issuer_name: 'PBG', access_key: '12345678abc' },
                    error: null,
                });
            }
            return q;
        };
        await approveAndLink({ invoiceId: 'nfe1', organizationId: 'org1', projectId: 'pr', dueDate: '2026-10-01', userId: 'u1', purchaseOrderId: 'o1' });
        (mod.supabase as { from: (t: string) => unknown }).from = fromOrig;

        const partidas = inseridos.filter(i => i.tabela === 'internal_transactions').map(i => i.linha);
        expect(partidas).toHaveLength(2);
        partidas.forEach(l => {
            expect(l.purchase_order_id).toBe('o1');
            expect(l.due_date).toBe('2026-10-01');
            expect(l.business_status).toBe('PREVISTO');
        });
    });
});
