import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * financialReceiptService — o que muda com o recibo de PAGAMENTO
 * (docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md):
 *  · `emitir` escolhe a RPC pelo tipo, e o default continua sendo recebimento
 *    (Contas a Receber não passou a mandar nada novo);
 *  · `listarAtivosDaOrg` lê numa consulta paginada, sem ids na URL.
 */
const db = vi.hoisted(() => {
    const chamadas: { metodo: string; args: unknown[] }[] = [];
    const linhas: { id: string; transaction_id: string | null; receipt_number: number }[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order']) {
        builder[m] = (...args: unknown[]) => { chamadas.push({ metodo: m, args }); return builder; };
    }
    builder.range = (from: number, to: number) => Promise.resolve({ data: linhas.slice(from, to + 1), error: null });
    const from = vi.fn(() => builder);
    const rpc = vi.fn(async () => ({ data: { id: 'r1' }, error: null }));
    return { chamadas, linhas, from, rpc };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from, rpc: db.rpc } }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { financialReceiptService } from '../services/financialReceiptService';

describe('financialReceiptService', () => {
    beforeEach(() => { db.chamadas.length = 0; db.linhas.length = 0; db.rpc.mockClear(); });

    it('emitir sem tipo continua chamando a RPC de recebimento', async () => {
        await financialReceiptService.emitir('tx-1');
        expect(db.rpc).toHaveBeenCalledWith('emitir_recibo_recebimento', { p_transaction_id: 'tx-1' });
    });

    it('emitir PAGAMENTO chama emitir_recibo_pagamento', async () => {
        await financialReceiptService.emitir('tx-2', 'PAGAMENTO');
        expect(db.rpc).toHaveBeenCalledWith('emitir_recibo_pagamento', { p_transaction_id: 'tx-2' });
    });

    it('listarAtivosDaOrg filtra tipo, ativos e organização, e indexa por título', async () => {
        db.linhas.push(
            { id: 'a', transaction_id: 't1', receipt_number: 1 },
            { id: 'b', transaction_id: null, receipt_number: 2 },   // título excluído
            { id: 'c', transaction_id: 't3', receipt_number: 3 },
        );
        const mapa = await financialReceiptService.listarAtivosDaOrg('org-1', 'PAGAMENTO');
        expect([...mapa.keys()]).toEqual(['t1', 't3']);
        expect(mapa.get('t3')?.receipt_number).toBe(3);
        expect(db.from).toHaveBeenCalledWith('financial_receipts');
        expect(db.chamadas).toContainEqual({ metodo: 'eq', args: ['kind', 'PAGAMENTO'] });
        expect(db.chamadas).toContainEqual({ metodo: 'is', args: ['cancelled_at', null] });
        expect(db.chamadas).toContainEqual({ metodo: 'eq', args: ['organization_id', 'org-1'] });
    });

    it('em "Todas" (org nula) não filtra organização — a RLS recorta', async () => {
        await financialReceiptService.listarAtivosDaOrg(null, 'PAGAMENTO');
        expect(db.chamadas.some(c => c.metodo === 'eq' && c.args[0] === 'organization_id')).toBe(false);
    });
});
