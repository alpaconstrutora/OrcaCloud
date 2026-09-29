/**
 * Costura P2P → Processos, Passo 3 do plano
 * docs/planos/2026-09-28-torre-p2p-processos.md: quatro eventos novos, um
 * resolvedor único.
 *
 * O que este arquivo trava:
 *   1. `processService.triggerPurchaseOrderEvent` resolve a org pela coluna DO
 *      PEDIDO (fallback `companies.org_id` só sem ela) e delega a `triggerEvent`;
 *      pedido inexistente ou erro → não lança, não dispara;
 *   2. `triggerForTransaction` só segue para título DEBIT com `purchase_order_id`;
 *   3. `orderService.approveOrder` dispara `purchase_order.approved` só quando a
 *      alçada FECHA (não no nível 1 de 2);
 *   4. `receiptService.createReceipt` dispara `purchase_receipt.divergence` para
 *      Parcial ou item com problema — e NÃO quando o status é 'Divergência'
 *      (esse é do `updateOrder`), nem para recebimento limpo;
 *   5. `payableService.updateStatus('PAGO')` dispara `internal_transaction.paid`;
 *      outros status, não;
 *   6. `bankReconciliationService.createMatch` dispara o mesmo evento após a RPC;
 *   7. motor lançando erro não derruba nenhuma das gravações de origem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const dados: Record<string, Linha | null> = {};
const rpcs: string[] = [];

function query(tabela: string) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
        select: chain, eq: chain, in: chain, order: chain, limit: chain, not: chain,
        maybeSingle: async () => ({ data: dados[tabela] ?? null, error: null }),
        single: async () => ({ data: dados[tabela] ?? null, error: dados[tabela] ? null : { message: 'não achou' } }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: (linha: Linha) => {
            const r = {
                select: () => r,
                single: async () => ({ data: { id: 'novo', ...linha }, error: null }),
                then: (res: (v: unknown) => void) => res({ error: null }),
            };
            return r;
        },
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => query(tabela),
        rpc: async (fn: string) => { rpcs.push(fn); return { data: { match_id: 'm1', payment_date: '2026-09-28', adjustment_id: null }, error: null }; },
        storage: { from: () => ({ upload: async () => ({ data: { path: 'p' }, error: null }) }) },
    },
}));
vi.mock('../services/approvalService', () => ({
    approvalService: { approve: async () => dados.__approve ?? { approval_status: 'APROVADO' } },
}));
vi.mock('../services/appSettingsService', () => ({ appSettingsService: { get: () => ({}), interpolateEmailSubject: () => '', interpolateEmailBody: () => '' } }));
vi.mock('../services/notificationService', () => ({ notificationService: { sendNotification: async () => {} } }));
vi.mock('../services/supplierService', () => ({ supplierService: { getById: async () => null }, getSupplierDisplayName: (s: { name: string }) => s.name }));
vi.mock('../services/financialService', () => ({ financialService: { syncOrderToFinance: async () => {} } }));
vi.mock('../services/webhookService', () => ({ webhookService: {} }));
vi.mock('../services/projectService', () => ({ projectService: {} }));
vi.mock('../services/discrepancyService', () => ({ discrepancyService: {} }));
vi.mock('../services/notificationLogService', () => ({ notificationLogService: { log: () => {} } }));
vi.mock('../services/whatsappService', () => ({ whatsappService: {} }));
vi.mock('../services/orderNumberingService', () => ({ generateOrderNumber: async () => 'PO-X' }));
vi.mock('../services/propertyExpenseService', () => ({ propertyExpenseService: {} }));
vi.mock('../lib/supabasePaginate', () => ({ fetchAllPages: async () => [], fetchAllPagesParallel: async () => [] }));
vi.mock('../utils/storageUtils', () => ({ sanitizeFileName: (s: string) => s }));

import { processService } from '../services/processService';
import { orderService } from '../services/orderService';
import { receiptService } from '../services/receiptService';
import { payableService } from '../services/payableService';
import { bankReconciliationService } from '../services/bankReconciliationService';

const PEDIDO = { id: 'po1', number: 'PC-1', organization_id: 'org-do-pedido', empresa_id: 'emp1', project_id: 'obra1', supplier_id: 'sup1' };

let disparos: { orgId: string; eventKey: string; ctx: Record<string, unknown> }[] = [];
let motorFalha = false;

beforeEach(() => {
    for (const k of Object.keys(dados)) delete dados[k];
    rpcs.length = 0;
    disparos = [];
    motorFalha = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(processService, 'triggerEvent').mockImplementation(async (orgId, eventKey, ctx) => {
        if (motorFalha) throw new Error('motor fora');
        disparos.push({ orgId, eventKey, ctx: ctx as Record<string, unknown> });
    });
});

describe('processService — resolvedor único do pedido', () => {
    it('resolve a org pela coluna do pedido e não consulta companies', async () => {
        dados.purchase_orders = PEDIDO;
        dados.companies = { org_id: 'org-da-empresa' };
        await processService.triggerPurchaseOrderEvent('po1', 'purchase_order.approved', { titleSuffix: 'Aprovado' });
        expect(disparos).toEqual([{ orgId: 'org-do-pedido', eventKey: 'purchase_order.approved',
            ctx: { title: 'Pedido PC-1 — Aprovado', purchaseOrderId: 'po1', supplierId: 'sup1', projectId: 'obra1' } }]);
    });

    it('pedido antigo sem organization_id cai em companies.org_id', async () => {
        dados.purchase_orders = { ...PEDIDO, organization_id: null };
        dados.companies = { org_id: 'org-da-empresa' };
        await processService.triggerPurchaseOrderEvent('po1', 'nfe.linked');
        expect(disparos[0].orgId).toBe('org-da-empresa');
    });

    it('pedido inexistente → nada dispara, nada lança', async () => {
        await expect(processService.triggerPurchaseOrderEvent('nope', 'nfe.linked')).resolves.toBeUndefined();
        expect(disparos).toHaveLength(0);
    });

    it('triggerForTransaction só segue para DEBIT com purchase_order_id', async () => {
        dados.purchase_orders = PEDIDO;
        dados.internal_transactions = { id: 't1', direction: 'CREDIT', purchase_order_id: 'po1' };
        await processService.triggerForTransaction('t1', 'internal_transaction.paid');
        dados.internal_transactions = { id: 't2', direction: 'DEBIT', purchase_order_id: null };
        await processService.triggerForTransaction('t2', 'internal_transaction.paid');
        expect(disparos).toHaveLength(0);
        dados.internal_transactions = { id: 't3', direction: 'DEBIT', purchase_order_id: 'po1' };
        await processService.triggerForTransaction('t3', 'internal_transaction.paid');
        expect(disparos).toHaveLength(1);
        expect(disparos[0]).toMatchObject({ orgId: 'org-do-pedido', eventKey: 'internal_transaction.paid' });
    });
});

describe('orderService.approveOrder → purchase_order.approved', () => {
    it('dispara quando a alçada fecha em APROVADO', async () => {
        dados.purchase_orders = PEDIDO;
        await orderService.approveOrder('po1', 1, 'gestor@x');
        expect(disparos.map(d => d.eventKey)).toEqual(['purchase_order.approved']);
    });

    it('nível 1 de 2 (ainda PENDENTE) não dispara', async () => {
        dados.purchase_orders = PEDIDO;
        dados.__approve = { approval_status: 'PENDENTE' };
        await orderService.approveOrder('po1', 1, 'gestor@x');
        expect(disparos).toHaveLength(0);
    });
});

describe('receiptService.createReceipt → purchase_receipt.divergence', () => {
    const item = (recebido: number, issue?: 'quebrado' | 'faltando') =>
        ({ code: 'c', description: 'd', unit: 'un', quantityOrdered: 10, quantityReceived: recebido, issue });

    it('Parcial dispara; Recebido com item quebrado dispara', async () => {
        dados.purchase_orders = PEDIDO;
        await receiptService.createReceipt('po1', { status: 'Parcial', items: [item(10)] });
        await receiptService.createReceipt('po1', { status: 'Recebido', items: [item(10, 'quebrado')] });
        expect(disparos.map(d => d.eventKey)).toEqual(['purchase_receipt.divergence', 'purchase_receipt.divergence']);
    });

    it('Divergência do pedido inteiro NÃO dispara aqui (é do updateOrder); recebimento limpo não dispara', async () => {
        dados.purchase_orders = PEDIDO;
        await receiptService.createReceipt('po1', { status: 'Divergência', items: [item(5, 'faltando')] });
        await receiptService.createReceipt('po1', { status: 'Recebido', items: [item(10)] });
        expect(disparos).toHaveLength(0);
    });
});

describe('baixa de título → internal_transaction.paid', () => {
    beforeEach(() => {
        dados.purchase_orders = PEDIDO;
        dados.internal_transactions = { id: 't1', direction: 'DEBIT', purchase_order_id: 'po1' };
    });

    it('payableService.updateStatus PAGO dispara; outros status não', async () => {
        await payableService.updateStatus('t1', 'APROVADO');
        expect(disparos).toHaveLength(0);
        await payableService.updateStatus('t1', 'PAGO');
        expect(disparos.map(d => d.eventKey)).toEqual(['internal_transaction.paid']);
    });

    it('payableService.darBaixa (painel, main 1d16990f) dispara também', async () => {
        await payableService.darBaixa('t1', { paymentDate: '2026-09-28', paymentType: null });
        expect(disparos.map(d => d.eventKey)).toEqual(['internal_transaction.paid']);
    });

    it('bankReconciliationService.createMatch dispara depois da RPC', async () => {
        const r = await bankReconciliationService.createMatch('b1', 't1', 'MANUAL' as never, 1);
        expect(rpcs).toEqual(['fn_reconcile_match']);
        expect(r.match_id).toBe('m1');
        expect(disparos.map(d => d.eventKey)).toEqual(['internal_transaction.paid']);
    });
});

describe('motor fora não derruba a origem', () => {
    it('approveOrder, createReceipt e updateStatus resolvem mesmo com o motor lançando', async () => {
        motorFalha = true;
        dados.purchase_orders = PEDIDO;
        dados.internal_transactions = { id: 't1', direction: 'DEBIT', purchase_order_id: 'po1' };
        await expect(orderService.approveOrder('po1', 1, 'g')).resolves.toBeUndefined();
        await expect(receiptService.createReceipt('po1', { status: 'Parcial', items: [] })).resolves.toBeDefined();
        await expect(payableService.updateStatus('t1', 'PAGO')).resolves.toBeUndefined();
    });
});
