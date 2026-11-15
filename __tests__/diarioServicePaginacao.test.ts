/**
 * Diário Contábil — o serviço traz o período INTEIRO (guia §6.7), não as 200
 * primeiras linhas. Até 14/11/2026 havia `.limit(200)` e os KPIs "Total
 * Débitos/Créditos" somavam só o que veio, sem aviso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({ total: 0, ranges: [] as [number, number][] }));

vi.mock('../lib/supabase', () => {
    const linha = (i: number) => ({
        journal_entry_id: `je-${i}`, organization_id: 'org-1', project_id: null,
        entry_date: '2026-03-01', description: `L${i}`, source_system: 'MANUAL', reference_id: null,
        debit_amount: 1, debit_account: 'Material', debit_group: 'CUSTO_OBRA',
        credit_amount: 1, credit_account: 'Fornecedores a Pagar', credit_group: 'PASSIVO',
        status: 'PENDING', created_at: '2026-03-01T10:00:00Z',
    });
    const consulta = () => {
        let de = 0, ate = 0;
        const q: Record<string, unknown> = {
            select: () => q, order: () => q, eq: () => q, gte: () => q, lte: () => q,
            range: (a: number, b: number) => { de = a; ate = b; estado.ranges.push([a, b]); return q; },
            then: (res: (v: unknown) => unknown) => {
                const fim = Math.min(ate, estado.total - 1);
                const data = [];
                for (let i = de; i <= fim; i++) data.push(linha(i));
                return Promise.resolve({ data, error: null }).then(res);
            },
        };
        return q;
    };
    return { supabase: { from: () => consulta() } };
});

import { listJournalEntries } from '../services/diarioService';

describe('listJournalEntries — paginação', () => {
    beforeEach(() => { estado.ranges = []; });

    it('2.350 lançamentos voltam todos, em 3 páginas de até 1000', async () => {
        estado.total = 2350;
        const r = await listJournalEntries('org-1', { dateFrom: '2026-01-01', dateTo: '2026-12-31' });
        expect(r).toHaveLength(2350);
        expect(estado.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
        expect(new Set(r.map(e => e.journalEntryId)).size).toBe(2350);
    });

    it('exatamente 1000 pede mais uma página (vazia) e para', async () => {
        estado.total = 1000;
        const r = await listJournalEntries(null);
        expect(r).toHaveLength(1000);
        expect(estado.ranges).toHaveLength(2);
    });

    it('3 lançamentos = 1 página', async () => {
        estado.total = 3;
        const r = await listJournalEntries('org-1');
        expect(r).toHaveLength(3);
        expect(estado.ranges).toEqual([[0, 999]]);
    });
});
