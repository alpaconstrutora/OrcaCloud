/**
 * Envio automático do pedido pelo WhatsApp do ÒPURA (OpenWA) ao marcar Enviado.
 * Piloto 23/11/2026, Tarefa 7 — docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md.
 *
 * O que trava (orderService.updateOrder):
 *   1. org do pedido usa o OpenWA com envio automático → enviarPedido(id, { automatico: true }),
 *      sem passar pela API oficial, e o retorno traz o aviso "na fila";
 *   2. o OpenWA recusa (sem telefone…) → o pedido volta salvo e o aviso diz o motivo;
 *   3. usa o OpenWA sem envio automático, ou a situação falha → caminho da API oficial de hoje;
 *   4. outro status → nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock sobe para o topo do arquivo: o estado e a classe falsa vêm de vi.hoisted.
const h = vi.hoisted(() => {
    class ErroWhatsappOpenwaFalso extends Error {
        codigo: string | null;
        constructor(m: string, c: string | null) { super(m); this.codigo = c; }
    }
    return {
        ErroWhatsappOpenwaFalso,
        chamadas: [] as string[],
        estado: {
            situacao: [] as { organizationId: string; usaNaOrg: boolean; envioAutomaticoPedido: boolean }[],
            situacaoFalha: false,
            erroNoEnvio: null as Error | null,
        },
    };
});
const { chamadas, estado, ErroWhatsappOpenwaFalso } = h;

const pedido = vi.hoisted(() => ({
    id: 'po1', number: 'PO-1', status: 'Enviado', version: 1, items: [],
    supplier_id: 'sup1', project_id: 'obra1', empresa_id: 'emp1', organization_id: 'org-do-pedido',
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => {
            const q: Record<string, unknown> = {};
            const chain = () => q;
            Object.assign(q, {
                select: chain, eq: chain, order: chain, in: chain,
                single: async () => ({ data: pedido, error: null }),
                maybeSingle: async () => ({ data: null, error: null }),
                update: () => ({ eq: async () => ({ error: null }) }),
            });
            return q;
        },
        rpc: async () => ({ data: null, error: null }),
    },
}));
vi.mock('../services/appSettingsService', () => ({ appSettingsService: { get: () => ({}), interpolateEmailSubject: () => '', interpolateEmailBody: () => '' } }));
vi.mock('../services/notificationService', () => ({ notificationService: { sendNotification: async () => {} } }));
vi.mock('../services/supplierService', () => ({ supplierService: { getById: async () => null }, getSupplierDisplayName: (s: { name: string }) => s.name }));
vi.mock('../services/financialService', () => ({ financialService: { syncOrderToFinance: async () => {} } }));
vi.mock('../services/receiptService', () => ({ receiptService: {} }));
vi.mock('../services/discrepancyService', () => ({ discrepancyService: {} }));
vi.mock('../services/notificationLogService', () => ({ notificationLogService: { log: () => {} } }));
vi.mock('../services/approvalService', () => ({ approvalService: {} }));
vi.mock('../services/orderNumberingService', () => ({ generateOrderNumber: async () => 'PO-X' }));
vi.mock('../services/processService', () => ({ processService: { triggerEvent: async () => {} } }));
vi.mock('../services/whatsappService', () => ({
    whatsappService: {
        apiAtivaNaOrg: async (org: string) => { h.chamadas.push(`cloud-ativa:${org}`); return true; },
        enviarPedido: async (id: string) => { h.chamadas.push(`cloud-enviar:${id}`); return { para: '55' }; },
    },
}));
vi.mock('../services/whatsappOpenwaService', () => ({
    ErroWhatsappOpenwa: h.ErroWhatsappOpenwaFalso,
    whatsappOpenwaService: {
        situacao: async () => {
            h.chamadas.push('openwa-situacao');
            if (h.estado.situacaoFalha) throw new Error('rpc fora');
            return h.estado.situacao;
        },
        enviarPedido: async (id: string, op?: { automatico?: boolean }) => {
            h.chamadas.push(`openwa-enviar:${id}:${op?.automatico ? 'auto' : 'manual'}`);
            if (h.estado.erroNoEnvio) throw h.estado.erroNoEnvio;
            return { status: 'na_fila' };
        },
    },
}));

import { orderService } from '../services/orderService';

beforeEach(() => {
    chamadas.length = 0;
    estado.situacao = [];
    estado.situacaoFalha = false;
    estado.erroNoEnvio = null;
});

describe('orderService — Enviado pelo WhatsApp do ÒPURA', () => {
    it('org usa o OpenWA com envio automático → fila do OpenWA, sem API oficial, aviso "na fila"', async () => {
        estado.situacao = [
            { organizationId: 'outra-org', usaNaOrg: false, envioAutomaticoPedido: false },
            { organizationId: 'org-do-pedido', usaNaOrg: true, envioAutomaticoPedido: true },
        ];
        const r = await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(chamadas).toEqual(['openwa-situacao', 'openwa-enviar:po1:auto']);
        expect(r.avisoWhatsapp?.tipo).toBe('info');
        expect(r.avisoWhatsapp?.mensagem).toMatch(/na fila/i);
    });

    it('OpenWA recusa (sem telefone) → pedido salvo e o aviso diz o motivo', async () => {
        estado.situacao = [{ organizationId: 'org-do-pedido', usaNaOrg: true, envioAutomaticoPedido: true }];
        estado.erroNoEnvio = new ErroWhatsappOpenwaFalso('Fornecedor sem telefone cadastrado.', 'sem_telefone');
        const r = await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(r.id).toBe('po1');
        expect(r.avisoWhatsapp?.tipo).toBe('error');
        expect(r.avisoWhatsapp?.mensagem).toMatch(/sem telefone/i);
        expect(chamadas).not.toContain('cloud-enviar:po1');
    });

    it('usa o OpenWA com envio automático desligado → caminho da API oficial de hoje', async () => {
        estado.situacao = [{ organizationId: 'org-do-pedido', usaNaOrg: true, envioAutomaticoPedido: false }];
        const r = await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(chamadas).toEqual(['openwa-situacao', 'cloud-ativa:org-do-pedido', 'cloud-enviar:po1']);
        expect(r.avisoWhatsapp).toBeUndefined();
    });

    it('situação do OpenWA indisponível → segue pela API oficial, pedido salvo', async () => {
        estado.situacaoFalha = true;
        const r = await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(chamadas).toEqual(['openwa-situacao', 'cloud-ativa:org-do-pedido', 'cloud-enviar:po1']);
        expect(r.id).toBe('po1');
    });

    it('outro status → nenhum WhatsApp', async () => {
        await orderService.updateOrder('po1', { status: 'Separação' });
        expect(chamadas).toEqual([]);
    });
});
