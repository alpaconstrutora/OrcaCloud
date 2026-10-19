/**
 * Suprimentos › Contratos › Financeiro: o sync do contrato (Lançar Financeiro,
 * Salvar dos Dados Gerais, reajuste) não apaga parcela paga/conciliada e não
 * sobrescreve valor alterado à mão. Até 19/10/2026 o Parcelado e o À Vista
 * apagavam TODAS as linhas do contrato e recriavam como PENDING.
 * Plano: docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][]; opts?: unknown };
const ops: Op[] = [];
/** Linhas devolvidas a um SELECT de internal_transactions, por source_system. */
let existentes: Record<string, unknown[]> = {};

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
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(resultado()),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));
vi.mock('../services/financialCategoryResolver', () => ({
    resolverCategoriaDoContrato: async () => ({ category: 'Serviços', category_id: null }),
}));

import { contractService } from '../services/contractService';

const contratoParcelado = {
    id: 'c1', organization_id: 'org1', number: 'CT-1', title: 'Empreita',
    is_recurring: false, payment_term_type: 'Parcelado', direction: 'OUTGOING',
    original_value: 3000, start_date: '2026-10-01',
    payment_schedule: [
        { date: '2026-10-10', value: 1000 },
        { date: '2026-11-10', value: 1000 },
        { date: '2026-12-10', value: 1000 },
    ],
};

const daTabela = (op: string) => ops.filter(o => o.table === 'internal_transactions' && o.op === op);

describe('syncContractToFinance (Parcelado) — preserva parcela baixada e valor manual', () => {
    beforeEach(() => { ops.length = 0; existentes = {}; });

    it('não apaga parcela conciliada nem a regrava; mantém o valor manual; refaz o resto', async () => {
        existentes = {
            CONTRACT_PARCELADO: [
                { id: 't1', reference_id: 'c1:p1', status: 'CONCILIATED', business_status: 'PAGO', amount: 1000 },
                {
                    id: 't2', reference_id: 'c1:p2', status: 'PENDING', business_status: 'PREVISTO', amount: 1350,
                    valor_manual: true, valor_manual_anterior: 1000, valor_manual_em: '2026-10-19T12:00:00Z', valor_manual_por: 'u1',
                },
                { id: 't3', reference_id: 'c1:p3', status: 'PENDING', business_status: 'PREVISTO', amount: 1000 },
            ],
        };

        await contractService.syncContractToFinance(contratoParcelado as never);

        const apagados = daTabela('delete').flatMap(d => (d.filters.find(f => f[0] === 'id')?.[1] as string[]) ?? []);
        expect(apagados).not.toContain('t1');   // conciliada
        expect(apagados).not.toContain('t2');   // manual: atualizada, não recriada
        expect(apagados).toContain('t3');

        const gravadas = daTabela('upsert').flatMap(u => u.args as Array<Record<string, unknown>>);
        expect(gravadas.find(g => g.reference_id === 'c1:p1')).toBeUndefined();
        expect(gravadas.find(g => g.reference_id === 'c1:p2')).toMatchObject({ amount: 1350, valor_manual: true, valor_manual_anterior: 1000 });
        expect(gravadas.find(g => g.reference_id === 'c1:p3')).toMatchObject({ amount: 1000, status: 'PENDING' });
    });

    it('medição já paga não é apagada pelo sync do parcelado', async () => {
        existentes = {
            CONTRACT_MEASUREMENT: [
                { id: 'm1', status: 'CONCILIATED', business_status: 'PAGO' },
                { id: 'm2', status: 'PENDING', business_status: 'PREVISTO' },
            ],
        };
        await contractService.syncContractToFinance(contratoParcelado as never);
        const apagados = daTabela('delete').flatMap(d => (d.filters.find(f => f[0] === 'id')?.[1] as string[]) ?? []);
        expect(apagados).not.toContain('m1');
        expect(apagados).toContain('m2');
    });
});

describe('syncContractToFinance (À Vista)', () => {
    beforeEach(() => { ops.length = 0; existentes = {}; });
    const aVista = { ...contratoParcelado, payment_term_type: 'À Vista', payment_schedule: [] };

    it('cobrança já paga: nada é apagado nem inserido', async () => {
        existentes = { CONTRACT_AVISTA: [{ id: 'a1', reference_id: 'c1', status: 'CONCILIATED', amount: 3000 }] };
        await contractService.syncContractToFinance(aVista as never);
        const apagados = daTabela('delete').flatMap(d => (d.filters.find(f => f[0] === 'id')?.[1] as string[]) ?? []);
        expect(apagados).not.toContain('a1');
        expect(daTabela('insert')).toHaveLength(0);
        expect(daTabela('upsert')).toHaveLength(0);
    });

    it('valor manual em aberto: regravada com o valor dela, não recriada', async () => {
        existentes = { CONTRACT_AVISTA: [{ id: 'a1', reference_id: 'c1', status: 'PENDING', amount: 2800, valor_manual: true, valor_manual_anterior: 3000 }] };
        await contractService.syncContractToFinance(aVista as never);
        const apagados = daTabela('delete').flatMap(d => (d.filters.find(f => f[0] === 'id')?.[1] as string[]) ?? []);
        expect(apagados).not.toContain('a1');
        expect(daTabela('insert')).toHaveLength(0);
        expect((daTabela('upsert')[0].args as Array<Record<string, unknown>>)[0]).toMatchObject({ amount: 2800, valor_manual: true });
    });
});
