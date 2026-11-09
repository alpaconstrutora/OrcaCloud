/**
 * `applyReajuste` em contrato PARCELADO: o reajuste chega às parcelas.
 * Até 09/11/2026 só `current_value` mudava (sobre o contrato inteiro) e o sync
 * regravava as parcelas a partir do `payment_schedule` antigo.
 * Puro: __tests__/reajusteParcelado.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][] };
const ops: Op[] = [];
let titulos: unknown[] = [];
let contrato: Record<string, unknown> = {};
/** Aditivos aprovados (lista) e o aditivo lido por id em approveAddendum. */
let aditivos: Array<{ value_impact: number }> = [];
let aditivo: Record<string, unknown> | null = null;

function table(name: string) {
    const rec: Op = { table: name, op: '', filters: [] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    const linha = () => (name === 'contracts'
        ? { data: rec.op === 'update' ? { ...contrato, ...(rec.args as object) } : contrato, error: null }
        : name === 'contract_addendums' && rec.op === 'select'
            ? { data: aditivo, error: null }
            : { data: null, error: null });
    Object.assign(b, {
        select: () => { if (!rec.op) rec.op = 'select'; return b; },
        insert: (p: unknown) => { rec.op = 'insert'; rec.args = p; ops.push(rec); return b; },
        upsert: (p: unknown) => { rec.op = 'upsert'; rec.args = p; ops.push(rec); return b; },
        update: (p: unknown) => { rec.op = 'update'; rec.args = p; ops.push(rec); return b; },
        delete: () => { rec.op = 'delete'; ops.push(rec); return b; },
        eq: filt, in: filt, like: filt, filter: filt, gte: filt, lte: filt, order: filt, limit: filt,
        maybeSingle: async () => linha(),
        single: async () => linha(),
        then: (resolve: (v: unknown) => void) => resolve(
            rec.op === 'select' && name === 'internal_transactions'
                && rec.filters.some(f => f[0] === 'source_system' && f[1] === 'CONTRACT_PARCELADO')
                ? { data: titulos, error: null }
                : rec.op === 'select' && name === 'contract_addendums'
                    ? { data: aditivos, error: null }
                    : { data: rec.op === 'select' ? [] : null, error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));
vi.mock('../services/financialCategoryResolver', () => ({
    resolverCategoriaDoContrato: async () => ({ category: 'Serviços', category_id: null }),
}));

import { contractService } from '../services/contractService';

const base = {
    id: 'c1', organization_id: 'org1', number: 'CT-1', title: 'Empreita', status: 'Ativo',
    is_recurring: false, payment_term_type: 'Parcelado', direction: 'OUTGOING',
    original_value: 3000, current_value: 3000, start_date: '2026-10-01', reajuste_index: 'INCC',
    payment_schedule: [
        { date: '2026-10-10', value: 1000 },
        { date: '2026-11-10', value: 1000 },
        { date: '2026-12-10', value: 1000 },
    ],
};

describe('applyReajuste — contrato Parcelado', () => {
    beforeEach(() => {
        ops.length = 0;
        contrato = structuredClone(base);
        titulos = [
            { id: 't1', reference_id: 'c1:p1', status: 'CONCILIATED', business_status: 'PAGO', amount: 1000, due_date: '2026-10-10' },
            { id: 't2', reference_id: 'c1:p2', status: 'PENDING', business_status: 'PREVISTO', amount: 1000, due_date: '2026-11-10' },
            { id: 't3', reference_id: 'c1:p3', status: 'PENDING', business_status: 'PREVISTO', amount: 1000, due_date: '2026-12-10' },
        ];
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-09T15:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('grava o cronograma reajustado, soma só o acréscimo do saldo e o sync lança o valor novo', async () => {
        await contractService.applyReajuste('c1', 100, 105);

        const upd = ops.find(o => o.table === 'contracts' && o.op === 'update')!.args as Record<string, unknown>;
        expect(upd.payment_schedule).toEqual([
            { date: '2026-10-10', value: 1000 },
            { date: '2026-11-10', value: 1050 },
            { date: '2026-12-10', value: 1050 },
        ]);
        expect(upd.current_value).toBe(3100); // não 3150: a parcela paga não sobe
        expect(upd.reajuste_acumulado).toBe(100);

        const gravadas = ops.filter(o => o.table === 'internal_transactions' && o.op === 'upsert')
            .flatMap(u => u.args as Array<Record<string, unknown>>);
        expect(gravadas.find(g => g.reference_id === 'c1:p1')).toBeUndefined();
        expect(gravadas.find(g => g.reference_id === 'c1:p2')).toMatchObject({ amount: 1050 });
        expect(gravadas.find(g => g.reference_id === 'c1:p3')).toMatchObject({ amount: 1050 });
    });

    it('segundo reajuste soma ao acumulado que já existia', async () => {
        contrato = { ...contrato, current_value: 3100, reajuste_acumulado: 100 };
        await contractService.applyReajuste('c1', 100, 110);
        const upd = ops.find(o => o.table === 'contracts' && o.op === 'update')!.args as Record<string, unknown>;
        expect(upd.current_value).toBe(3300); // p2 e p3: 1000 → 1100
        expect(upd.reajuste_acumulado).toBe(300);
    });

    it('sem parcela a reajustar: recusa e não grava nada', async () => {
        titulos = (titulos as Array<Record<string, unknown>>).map(t => ({ ...t, status: 'CONCILIATED', business_status: 'PAGO' }));
        await expect(contractService.applyReajuste('c1', 100, 105)).rejects.toThrow(/Nenhuma parcela a vencer/);
        expect(ops.filter(o => o.op === 'update' || o.op === 'upsert')).toHaveLength(0);
    });
});

/**
 * `current_value` de contrato não recorrente = original + Σ aditivos aprovados
 * + reajuste acumulado. Até 09/11/2026 as duas fórmulas (Salvar do contrato e
 * aprovação de aditivo) não somavam o reajuste — o formulário manda o Valor
 * Original em todo "Salvar", então qualquer salvamento apagava o reajuste.
 */
describe('valor atual preserva o reajuste acumulado', () => {
    beforeEach(() => {
        ops.length = 0;
        titulos = [];
        aditivos = [];
        aditivo = null;
        contrato = { ...structuredClone(base), current_value: 3100, reajuste_acumulado: 100 };
    });

    const valorGravado = () => (ops.find(o => o.table === 'contracts' && o.op === 'update')!.args as Record<string, unknown>).current_value;

    it('updateContract com Valor Original: original + aditivos + reajuste', async () => {
        aditivos = [{ value_impact: 150 }];
        await contractService.updateContract('c1', { original_value: 3000 } as never);
        expect(valorGravado()).toBe(3250);
    });

    it('updateContract em contrato sem reajuste continua original + aditivos', async () => {
        contrato = { ...contrato, current_value: 3150, reajuste_acumulado: 0 };
        aditivos = [{ value_impact: 150 }];
        await contractService.updateContract('c1', { original_value: 3200 } as never);
        expect(valorGravado()).toBe(3350);
    });

    it('approveAddendum: original + aditivos (com o novo) + reajuste', async () => {
        aditivo = { id: 'a1', contract_id: 'c1', value_impact: 200, status: 'Pendente' };
        aditivos = [{ value_impact: 200 }];
        await contractService.approveAddendum('a1', 'u1');
        const upd = ops.filter(o => o.table === 'contracts' && o.op === 'update')
            .map(o => o.args as Record<string, unknown>).find(a => 'current_value' in a)!;
        expect(upd.current_value).toBe(3300);
    });
});
