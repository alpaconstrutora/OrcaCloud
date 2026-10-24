/**
 * Suprimentos › Contratos › Financeiro › Parcelas › Alterar vencimento (24/10/2026):
 *  - `updateFinancialEntry` com `due_date` novo marca a parcela (vencimento_manual*);
 *  - os syncs do contrato (Parcelado, Recorrente, À Vista) mantêm a data dessa parcela.
 * Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][]; opts?: unknown };
const ops: Op[] = [];
/** Linhas devolvidas a um SELECT de internal_transactions, por source_system. */
let existentes: Record<string, unknown[]> = {};
/** Linha devolvida pelos `maybeSingle()` de internal_transactions (updateFinancialEntry). */
let linhaAtual: Record<string, unknown> | null = null;

function table(name: string) {
    const rec: Op = { table: name, op: '', filters: [] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    const resultado = () => {
        if (rec.op === 'select' && name === 'internal_transactions') {
            const src = rec.filters.find(f => f[0] === 'source_system')?.[1] as string;
            return { data: existentes[src] ?? [], error: null };
        }
        return { data: rec.op === 'select' ? [] : null, error: null };
    };
    Object.assign(b, {
        select: () => { if (!rec.op) rec.op = 'select'; return b; },
        insert: (p: unknown) => { rec.op = 'insert'; rec.args = p; ops.push(rec); return b; },
        upsert: (p: unknown, o: unknown) => { rec.op = 'upsert'; rec.args = p; rec.opts = o; ops.push(rec); return b; },
        update: (p: unknown) => { rec.op = 'update'; rec.args = p; ops.push(rec); return b; },
        delete: () => { rec.op = 'delete'; ops.push(rec); return b; },
        eq: filt, in: filt, like: filt, filter: filt, gte: filt, lte: filt, order: filt, limit: filt,
        maybeSingle: async () => ({ data: name === 'internal_transactions' ? linhaAtual : null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(resultado()),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (name: string) => table(name),
        auth: { getUser: async () => ({ data: { user: { id: 'u-sessao' } } }) },
    },
}));
vi.mock('../services/financialCategoryResolver', () => ({
    resolverCategoriaDoContrato: async () => ({ category: 'Serviços', category_id: null }),
}));

import { contractService } from '../services/contractService';

const daTabela = (op: string) => ops.filter(o => o.table === 'internal_transactions' && o.op === op);
const gravadas = () => daTabela('upsert').flatMap(u => u.args as Array<Record<string, unknown>>);
const apagados = () => daTabela('delete').flatMap(d => (d.filters.find(f => f[0] === 'id')?.[1] as string[]) ?? []);

const base = {
    id: 'c1', organization_id: 'org1', number: 'CT-1', title: 'Empreita', direction: 'OUTGOING',
    original_value: 3000, start_date: '2026-10-01',
};

describe('updateFinancialEntry — vencimento alterado à mão', () => {
    beforeEach(() => { ops.length = 0; linhaAtual = null; });

    it('data nova: grava a data e marca quem/quando/o vencimento que o contrato gerou', async () => {
        linhaAtual = { id: 't2', status: 'PENDING', business_status: 'PREVISTO', due_date: '2026-11-10', transaction_date: '2026-11-10', vencimento_manual: false };
        await contractService.updateFinancialEntry('t2', { due_date: '2026-11-20' });
        const upd = daTabela('update').at(-1)!.args as Record<string, unknown>;
        expect(upd).toMatchObject({
            due_date: '2026-11-20', transaction_date: '2026-11-20',
            vencimento_manual: true, vencimento_manual_anterior: '2026-11-10', vencimento_manual_por: 'u-sessao',
        });
        expect(upd.vencimento_manual_em).toEqual(expect.any(String));
    });

    it('mesma data: não marca', async () => {
        linhaAtual = { id: 't2', status: 'PENDING', due_date: '2026-11-10', transaction_date: '2026-11-10' };
        await contractService.updateFinancialEntry('t2', { due_date: '2026-11-10' });
        const upd = daTabela('update').at(-1)?.args as Record<string, unknown> | undefined;
        expect(upd?.vencimento_manual).toBeUndefined();
    });
});

describe('syncs do contrato mantêm o vencimento manual', () => {
    beforeEach(() => { ops.length = 0; existentes = {}; });

    it('Parcelado: a parcela 2 fica com a data dela; as outras seguem o cronograma', async () => {
        existentes = {
            CONTRACT_PARCELADO: [
                { id: 't1', reference_id: 'c1:p1', status: 'PENDING', amount: 1000, due_date: '2026-10-10' },
                {
                    id: 't2', reference_id: 'c1:p2', status: 'PENDING', amount: 1000,
                    due_date: '2026-11-20', transaction_date: '2026-11-20',
                    vencimento_manual: true, vencimento_manual_anterior: '2026-11-10',
                },
            ],
        };
        await contractService.syncContractToFinance({
            ...base, is_recurring: false, payment_term_type: 'Parcelado',
            payment_schedule: [
                { date: '2026-10-10', value: 1000 }, { date: '2026-11-10', value: 1000 }, { date: '2026-12-10', value: 1000 },
            ],
        } as never);

        expect(apagados()).not.toContain('t2');
        expect(gravadas().find(g => g.reference_id === 'c1:p2')).toMatchObject({
            due_date: '2026-11-20', transaction_date: '2026-11-20', vencimento_manual: true, amount: 1000,
        });
        expect(gravadas().find(g => g.reference_id === 'c1:p3')).toMatchObject({ due_date: '2026-12-10' });
    });

    it('Recorrente: a parcela com data editada não volta para a data da cadência', async () => {
        const recorrente = {
            ...base, is_recurring: true, billing_cycle: 'Mensal', due_day: 10,
            payment_term_type: 'Vista', end_date: '2027-01-31',
        };
        // 1ª passada: descobre a chave que a cadência gera para a 2ª parcela.
        await contractService.syncContractToFinance(recorrente as never);
        const geradas = gravadas();
        expect(geradas.length).toBeGreaterThan(1);
        const segunda = geradas[1];

        ops.length = 0;
        existentes = {
            CONTRACT_RECURRING: [{
                id: 'r2', reference_id: segunda.reference_id, status: 'PENDING', amount: 3000,
                due_date: '2027-02-05', transaction_date: '2027-02-05',
                vencimento_manual: true, vencimento_manual_anterior: segunda.due_date,
            }],
        };
        await contractService.syncContractToFinance(recorrente as never);
        expect(gravadas().find(g => g.reference_id === segunda.reference_id)).toMatchObject({
            due_date: '2027-02-05', transaction_date: '2027-02-05', vencimento_manual: true,
        });
    });

    it('À Vista: cobrança com data editada é regravada com a data dela, não recriada', async () => {
        existentes = {
            CONTRACT_AVISTA: [{
                id: 'a1', reference_id: 'c1', status: 'PENDING', amount: 3000,
                due_date: '2026-10-25', transaction_date: '2026-10-25', vencimento_manual: true,
            }],
        };
        await contractService.syncContractToFinance({ ...base, is_recurring: false, payment_term_type: 'À Vista' } as never);
        expect(apagados()).not.toContain('a1');
        expect(daTabela('insert')).toHaveLength(0);
        expect(gravadas()[0]).toMatchObject({ due_date: '2026-10-25', vencimento_manual: true, amount: 3000 });
    });
});
