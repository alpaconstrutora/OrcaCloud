/**
 * Pós-Obra & Garantia ↔ Suprimentos (2026-10-11, Fase 1.2): o vínculo
 * `warranty_claim_id` da Solicitação de Compra é gravado SÓ na criação.
 * `update()` usa `headerFromDraft`, que serve criar e editar — se o vínculo
 * entrasse lá, editar uma SC aberta pela tela de Suprimentos (sem o chamado no
 * rascunho) o apagaria.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const gravado: { tabela: string; op: string; payload: unknown }[] = [];

const SC_RASCUNHO: Linha = {
    id: 'sc1', organization_id: 'org1', project_id: 'obra1', number: 'SC-1', title: 'Garantia',
    priority: 'normal', approval_status: 'RASCUNHO', warranty_claim_id: 'cl1',
    purchase_request_items: [{ id: 'i1', request_id: 'sc1', position: 0, source: 'avulso', description: 'Manta', unit: 'm2', quantity: 10, estimated_unit_price: 5 }],
};

function query(tabela: string) {
    let op = 'select';
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const resposta = async () => {
        if (tabela === 'projects') return { data: { organization_id: 'org1' }, error: null };
        if (tabela === 'purchase_requests' && op === 'insert') return { data: { id: 'sc1' }, error: null };
        if (tabela === 'purchase_requests') return { data: SC_RASCUNHO, error: null };
        return { data: null, error: null };
    };
    const gravar = (nome: string) => (payload?: unknown) => { op = nome; gravado.push({ tabela, op: nome, payload }); return q; };
    Object.assign(q, {
        select: chain, eq: chain, in: chain, order: chain,
        insert: gravar('insert'), update: gravar('update'), upsert: gravar('upsert'), delete: gravar('delete'),
        single: () => resposta(),
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => resposta().then(res, rej),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (t: string) => query(t),
        auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
    },
}));
vi.mock('../services/approvalService', () => ({ approvalService: {} }));
vi.mock('../services/quotationService', () => ({ quotationService: {} }));
vi.mock('../services/orderService', () => ({ orderService: {} }));
vi.mock('../services/notificationService', () => ({ notificationService: {} }));
vi.mock('../services/purchaseRequestNumberingService', () => ({ generatePurchaseRequestNumber: async () => 'SC-1' }));

import { purchaseRequestService } from '../services/purchaseRequestService';

const draft = {
    projectId: 'obra1', title: 'Garantia', priority: 'normal' as const,
    items: [{ source: 'avulso' as const, description: 'Manta', unit: 'm2', quantity: 10, estimatedUnitPrice: 5 }],
};

describe('SC ↔ chamado de garantia', () => {
    beforeEach(() => { gravado.length = 0; });

    it('create grava o warranty_claim_id do rascunho', async () => {
        await purchaseRequestService.create({ ...draft, warrantyClaimId: 'cl1' });
        const ins = gravado.find(g => g.tabela === 'purchase_requests' && g.op === 'insert');
        expect((ins?.payload as Linha).warranty_claim_id).toBe('cl1');
    });

    it('update NÃO envia warranty_claim_id — editar não apaga o vínculo', async () => {
        await purchaseRequestService.update('sc1', { ...draft, items: [{ ...draft.items[0], id: 'i1' }] });
        const upd = gravado.find(g => g.tabela === 'purchase_requests' && g.op === 'update');
        expect(upd).toBeDefined();
        expect(upd?.payload as Linha).not.toHaveProperty('warranty_claim_id');
    });

    it('a SC lida traz o vínculo', async () => {
        const sc = await purchaseRequestService.get('sc1');
        expect(sc.warrantyClaimId).toBe('cl1');
    });
});
