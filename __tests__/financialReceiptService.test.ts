import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * financialReceiptService —
 *  · `emitir` escolhe a RPC pelo tipo, e o default continua sendo recebimento
 *    (docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md);
 *  · `listarAtivosDaOrg` lê numa consulta paginada, sem ids na URL;
 *  · `baixarPdf` lê logo + contato da organização DONA do recibo numa consulta
 *    só, com cache (docs/planos/2026-10-04-recibo-novo-layout.md).
 */
const db = vi.hoisted(() => {
    const chamadas: { metodo: string; args: unknown[] }[] = [];
    const linhas: { id: string; transaction_id: string | null; receipt_number: number }[] = [];
    const org: { data: Record<string, unknown> | null; error: { message: string } | null } = { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order']) {
        builder[m] = (...args: unknown[]) => { chamadas.push({ metodo: m, args }); return builder; };
    }
    builder.range = (from: number, to: number) => Promise.resolve({ data: linhas.slice(from, to + 1), error: null });
    builder.maybeSingle = () => { chamadas.push({ metodo: 'maybeSingle', args: [] }); return Promise.resolve(org); };
    const from = vi.fn(() => builder);
    const rpc = vi.fn(async () => ({ data: { id: 'r1' }, error: null }));
    const upload = vi.fn(async () => ({ error: null }));
    const storage = { from: () => ({ upload, download: vi.fn(async () => ({ data: null, error: { message: 'x' } })) }) };
    const montarReciboPdf = vi.fn(() => ({ output: () => new Blob(['pdf']) }));
    return { chamadas, linhas, org, from, rpc, upload, storage, montarReciboPdf };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from, rpc: db.rpc, storage: db.storage } }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('../utils/reciboRecebimento', () => ({
    montarReciboPdf: db.montarReciboPdf,
    nomeArquivoRecibo: () => 'r.pdf',
}));

import { financialReceiptService } from '../services/financialReceiptService';

const consultasDeOrg = () => db.chamadas.filter(c => c.metodo === 'maybeSingle').length;

describe('financialReceiptService', () => {
    beforeEach(() => {
        db.chamadas.length = 0; db.linhas.length = 0; db.rpc.mockClear(); db.from.mockClear(); db.montarReciboPdf.mockClear();
        db.org.data = null; db.org.error = null;
    });

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

    describe('baixarPdf — logo e contato vêm da organização DONA do recibo', () => {
        const reciboNovo = (org: string) => ({ id: `rec-${org}`, organization_id: org, file_path: null, receipt_number: 4 });

        it('consulta logo_url,phone,email,website uma vez e entrega ao gerador; logo do chamador prevalece', async () => {
            db.rpc.mockResolvedValueOnce({ data: reciboNovo('org-A'), error: null } as never);
            db.org.data = { logo_url: 'data:image/png;base64,ORG', phone: '35999055003', email: 'f@alpa.com', website: 'www.alpa.com' };

            await financialReceiptService.baixarPdf('tx-1', { logoUrl: null });

            expect(db.from).toHaveBeenCalledWith('organizations');
            expect(db.chamadas).toContainEqual({ metodo: 'select', args: ['logo_url,phone,email,website'] });
            expect(db.chamadas).toContainEqual({ metodo: 'eq', args: ['id', 'org-A'] });
            expect(db.montarReciboPdf).toHaveBeenCalledTimes(1);
            const [, extras] = db.montarReciboPdf.mock.calls[0] as unknown as [unknown, { logoDataUrl: string | null; contato: unknown }];
            // `logoUrl: null` do chamador prevalece sobre a logo da org…
            expect(extras.logoDataUrl).toBeNull();
            // …mas o contato vem sempre da org.
            expect(extras.contato).toEqual({ phone: '35999055003', email: 'f@alpa.com', website: 'www.alpa.com' });
        });

        it('segunda baixa da mesma organização não repete a consulta (cache por sessão)', async () => {
            db.rpc.mockResolvedValueOnce({ data: reciboNovo('org-A'), error: null } as never);
            const antes = consultasDeOrg();
            await financialReceiptService.baixarPdf('tx-2', { logoUrl: null });
            expect(consultasDeOrg()).toBe(antes);
            expect(db.montarReciboPdf).toHaveBeenCalledTimes(1);
        });

        it('organização que não responde → recibo sai sem contato, nunca deixa de sair', async () => {
            db.rpc.mockResolvedValueOnce({ data: reciboNovo('org-B'), error: null } as never);
            db.org.error = { message: 'RLS' };
            const { recibo } = await financialReceiptService.baixarPdf('tx-3', { logoUrl: null });
            expect(recibo.id).toBe('rec-org-B');
            const [, extras] = db.montarReciboPdf.mock.calls[0] as unknown as [unknown, { contato: unknown }];
            expect(extras.contato).toBeNull();
        });
    });
});
