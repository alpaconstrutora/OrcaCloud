/**
 * Costura P2P → Processos: a instância nasce na org DO PEDIDO.
 * docs/planos/2026-09-28-torre-p2p-processos.md — Passo 1.1
 *
 * O gancho em `orderService.updateOrder` (bloco 2b) resolvia a organização por
 * `empresa_id → companies.org_id`, porque `purchase_orders` não tinha
 * `organization_id` quando ele nasceu. Hoje tem — e, medido em 28/09/2026,
 * ela DIVERGE de `companies.org_id` nos 2 pedidos recebidos reais. O que este
 * arquivo trava:
 *   1. com `organization_id` no pedido, é ELA que vai ao `triggerEvent` — e
 *      `companies` nem é consultada;
 *   2. pedido antigo sem `organization_id` ainda cai em `companies.org_id`;
 *   3. status que não é Recebido/Divergência não dispara nada;
 *   4. erro no motor não derruba a atualização do pedido (best-effort).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const consultas: string[] = [];
const disparos: { orgId: string; eventKey: string; ctx: Record<string, unknown> }[] = [];
let pedido: Record<string, unknown> = {};
let motorFalha = false;

function query(tabela: string) {
    consultas.push(tabela);
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
        select: chain, eq: chain, order: chain, in: chain,
        single: async () => ({ data: tabela === 'purchase_orders' ? pedido : null, error: null }),
        maybeSingle: async () => ({ data: tabela === 'companies' ? { org_id: 'org-da-empresa' } : null, error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: { from: (tabela: string) => query(tabela), rpc: async () => ({ data: null, error: null }) },
}));
vi.mock('../services/appSettingsService', () => ({ appSettingsService: { get: () => ({}), interpolateEmailSubject: () => '', interpolateEmailBody: () => '' } }));
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
vi.mock('../services/processService', () => ({
    processService: {
        triggerEvent: async (orgId: string, eventKey: string, ctx: Record<string, unknown>) => {
            if (motorFalha) throw new Error('motor fora');
            disparos.push({ orgId, eventKey, ctx });
        },
    },
}));

import { orderService } from '../services/orderService';

const pedidoBase = {
    id: 'po1', number: 'PO-1', status: 'Enviado', version: 1, items: [],
    supplier_id: 'sup1', project_id: 'obra1', empresa_id: 'emp1',
};

describe('gancho P2P → Processos — org do pedido', () => {
    beforeEach(() => {
        consultas.length = 0;
        disparos.length = 0;
        motorFalha = false;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('usa purchase_orders.organization_id e não consulta companies', async () => {
        pedido = { ...pedidoBase, organization_id: 'org-do-pedido' };
        await orderService.updateOrder('po1', { status: 'Recebido' });
        expect(disparos).toHaveLength(1);
        expect(disparos[0]).toMatchObject({
            orgId: 'org-do-pedido',
            eventKey: 'purchase_order.received',
            ctx: { purchaseOrderId: 'po1', supplierId: 'sup1', projectId: 'obra1' },
        });
        expect(consultas).not.toContain('companies');
    });

    it('pedido antigo sem organization_id ainda resolve pela empresa', async () => {
        pedido = { ...pedidoBase, organization_id: null };
        await orderService.updateOrder('po1', { status: 'Divergência' });
        expect(disparos).toHaveLength(1);
        expect(disparos[0].orgId).toBe('org-da-empresa');
        expect(disparos[0].eventKey).toBe('purchase_order.divergence');
        expect(consultas).toContain('companies');
    });

    it('status fora de Recebido/Divergência não dispara', async () => {
        pedido = { ...pedidoBase, organization_id: 'org-do-pedido' };
        await orderService.updateOrder('po1', { status: 'Confirmado' });
        expect(disparos).toHaveLength(0);
    });

    it('motor fora não derruba a atualização do pedido', async () => {
        pedido = { ...pedidoBase, organization_id: 'org-do-pedido' };
        motorFalha = true;
        await expect(orderService.updateOrder('po1', { status: 'Recebido' })).resolves.toBeDefined();
    });
});
