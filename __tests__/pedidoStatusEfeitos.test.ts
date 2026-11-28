/**
 * `criarEfeitosDoStatus` — aviso ao fornecedor, parcelas a pagar e processos quando
 * o status do pedido muda. O MESMO código roda no navegador (`updateOrder`) e na
 * Edge `pedido-recebimento` (celular e link). docs/planos/2026-11-27-recebimento-mobile.md, Fase 1.
 */
import { describe, it, expect, vi } from 'vitest';
import { criarEfeitosDoStatus, depsComBanco, type DepsDosEfeitos } from '../services/pedidoStatusEfeitos';

const PEDIDO = { id: 'po1', number: 'PO-1', supplier_id: 'f1', organization_id: 'org1', empresa_id: 'emp1', project_id: 'obra1' };

function deps(over: Partial<DepsDosEfeitos> = {}) {
    const d = {
        emailDoFornecedor: vi.fn(async () => 'f@x.com' as string | null),
        notificar: vi.fn(async () => {}),
        registrarLog: vi.fn(async () => {}),
        financeiro: { syncOrderToFinance: vi.fn(async () => ({ gerou: 2 } as const)) },
        processos: { triggerEvent: vi.fn(async () => null) },
        orgDaEmpresa: vi.fn(async () => 'org-da-empresa' as string | null),
        textos: {
            assunto: (p: { orderNumber: string; newStatus: string }) => `Status do Pedido ${p.orderNumber}`,
            corpo: (p: { orderNumber: string; newStatus: string }) => `foi para "${p.newStatus}"`,
        },
        ...over,
    };
    return d;
}

describe('criarEfeitosDoStatus', () => {
    it('Recebido: avisa o fornecedor, registra o log, gera parcelas e abre processo na org do pedido', async () => {
        const d = deps();
        const r = await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Recebido');
        expect(d.notificar).toHaveBeenCalledWith({
            recipientEmail: 'f@x.com', title: 'Status do Pedido PO-1', message: 'foi para "Recebido"',
            link: '/supplier-portal?tab=orders&order=po1', type: 'status_change',
        });
        expect(d.registrarLog).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'po1', status: 'sent', recipient: 'f@x.com' }));
        expect(d.financeiro.syncOrderToFinance).toHaveBeenCalledWith('po1');
        expect(d.processos.triggerEvent).toHaveBeenCalledWith('org1', 'purchase_order.received', expect.objectContaining({ purchaseOrderId: 'po1' }));
        expect(r).toEqual({ financeiro: { gerou: 2 } });
    });

    it('Divergência abre o processo de divergência; Entregue não abre processo, mas gera parcelas', async () => {
        const d = deps();
        await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Divergência');
        expect(d.processos.triggerEvent).toHaveBeenCalledWith('org1', 'purchase_order.divergence', expect.anything());
        const e = deps();
        await criarEfeitosDoStatus(e).aplicar(PEDIDO, 'Entregue');
        expect(e.processos.triggerEvent).not.toHaveBeenCalled();
        expect(e.financeiro.syncOrderToFinance).toHaveBeenCalled();
    });

    it('status antes da entrega: só o aviso (sem parcelas, sem processo)', async () => {
        const d = deps();
        const r = await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Em Trânsito');
        expect(d.notificar).toHaveBeenCalled();
        expect(d.financeiro.syncOrderToFinance).not.toHaveBeenCalled();
        expect(d.processos.triggerEvent).not.toHaveBeenCalled();
        expect(r).toEqual({});
    });

    it('reenvio de conferência já gravada (sem aviso, sem processo): só refaz as parcelas', async () => {
        const d = deps();
        await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Recebido', { avisarFornecedor: false, abrirProcessos: false });
        expect(d.notificar).not.toHaveBeenCalled();
        expect(d.registrarLog).not.toHaveBeenCalled();
        expect(d.financeiro.syncOrderToFinance).toHaveBeenCalled();
        expect(d.processos.triggerEvent).not.toHaveBeenCalled();
    });

    it('falha do aviso vira log "failed" e não impede o resto', async () => {
        const d = deps({ notificar: vi.fn(async () => { throw new Error('sem rede'); }) });
        const r = await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Recebido');
        expect(d.registrarLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'sem rede' }));
        expect(r.financeiro).toEqual({ gerou: 2 });
    });

    it('falha do financeiro volta como { falhou } (a tela explica) e o processo ainda abre', async () => {
        const d = deps({ financeiro: { syncOrderToFinance: vi.fn(async () => { throw new Error('obra travada'); }) } });
        const r = await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Recebido');
        expect(r.financeiro).toEqual({ falhou: 'obra travada' });
        expect(d.processos.triggerEvent).toHaveBeenCalled();
    });

    it('pedido antigo sem organization_id: processo na org da empresa', async () => {
        const d = deps();
        await criarEfeitosDoStatus(d).aplicar({ ...PEDIDO, organization_id: null }, 'Recebido');
        expect(d.orgDaEmpresa).toHaveBeenCalledWith('emp1');
        expect(d.processos.triggerEvent).toHaveBeenCalledWith('org-da-empresa', 'purchase_order.received', expect.anything());
    });

    it('fornecedor sem e-mail: não avisa nem registra', async () => {
        const d = deps({ emailDoFornecedor: vi.fn(async () => null) });
        await criarEfeitosDoStatus(d).aplicar(PEDIDO, 'Recebido');
        expect(d.notificar).not.toHaveBeenCalled();
        expect(d.registrarLog).not.toHaveBeenCalled();
    });
});

describe('depsComBanco (o que a Edge usa)', () => {
    function bancoFalso() {
        const inseridos: { tabela: string; linha: Record<string, unknown> }[] = [];
        const db = {
            from: (tabela: string) => ({
                select: () => ({ eq: () => ({ maybeSingle: async () => (
                    tabela === 'suppliers' ? { data: { email: 'f@x.com' } }
                    : tabela === 'companies' ? { data: { org_id: 'org-e' } } : { data: null }) }) }),
                insert: async (linha: Record<string, unknown>) => { inseridos.push({ tabela, linha }); return { error: null }; },
            }),
        };
        return { db, inseridos };
    }

    it('aviso em notifications (sem org, como no navegador) e log em notification_log', async () => {
        const { db, inseridos } = bancoFalso();
        const extra = deps();
        await criarEfeitosDoStatus(depsComBanco(db, { financeiro: extra.financeiro, processos: extra.processos, textos: extra.textos }))
            .aplicar({ ...PEDIDO, organization_id: null }, 'Recebido');
        expect(inseridos.find(i => i.tabela === 'notifications')?.linha).toEqual({
            recipient_email: 'f@x.com', title: 'Status do Pedido PO-1', message: 'foi para "Recebido"',
            link: '/supplier-portal?tab=orders&order=po1', type: 'status_change', organization_id: null,
        });
        expect(inseridos.find(i => i.tabela === 'notification_log')?.linha).toEqual(expect.objectContaining({ order_id: 'po1', status: 'sent' }));
        expect(extra.processos.triggerEvent).toHaveBeenCalledWith('org-e', 'purchase_order.received', expect.anything());
    });
});
