/**
 * Suprimentos › Contratos › excluir: os títulos gerados no Financeiro são
 * CANCELADOS (não apagados) antes do DELETE, para qualquer tipo de contrato
 * (à vista ficava de fora e deixava título órfão — "Igreja Divino", R$ 400 mil,
 * pendente por 3 meses após o contrato sumir). Título já pago bloqueia.
 * Pedido de 2026-09-13.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const calls: { table: string; op: string; args?: unknown }[] = [];
let titulos: Row[] = [];

// Builder mínimo encadeável: só o que deleteContract usa.
function table(name: string) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
        select: (..._a: unknown[]) => { calls.push({ table: name, op: 'select' }); return b; },
        eq: chain, in: chain, like: chain, filter: chain, order: chain, limit: chain,
        single: async () => ({ data: name === 'contracts' ? { id: 'c1', is_recurring: false, organization_id: 'org1', number: '001', project_id: null, payment_term_type: 'À Vista' } : null, error: null }),
        update: (payload: unknown) => { calls.push({ table: name, op: 'update', args: payload }); return b; },
        delete: () => { calls.push({ table: name, op: 'delete' }); return b; },
        then: (resolve: (v: unknown) => void) => resolve({ data: name === 'internal_transactions' ? titulos : [], error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));

import { contractService } from '../services/contractService';

describe('contractService.deleteContract — títulos do Financeiro', () => {
    beforeEach(() => { calls.length = 0; });

    it('contrato à vista com título pendente: cancela o título e só depois exclui o contrato', async () => {
        titulos = [{ id: 't1', status: 'PENDING' }];
        await contractService.deleteContract('c1');
        const upd = calls.find(c => c.table === 'internal_transactions' && c.op === 'update');
        expect(upd?.args).toEqual({ status: 'CANCELLED', business_status: 'CANCELADO' });
        const del = calls.findIndex(c => c.table === 'contracts' && c.op === 'delete');
        expect(calls.indexOf(upd!)).toBeLessThan(del);
        // nunca apaga título
        expect(calls.some(c => c.table === 'internal_transactions' && c.op === 'delete')).toBe(false);
    });

    it('título já pago bloqueia a exclusão e nada é apagado', async () => {
        titulos = [{ id: 't1', status: 'CONCILIATED' }, { id: 't2', status: 'PENDING' }];
        await expect(contractService.deleteContract('c1')).rejects.toThrow(/1 título\(s\) já foram pagos/);
        expect(calls.some(c => c.op === 'delete')).toBe(false);
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('já cancelado não é tocado de novo', async () => {
        titulos = [{ id: 't1', status: 'CANCELLED' }];
        await contractService.deleteContract('c1');
        expect(calls.some(c => c.table === 'internal_transactions' && c.op === 'update')).toBe(false);
        expect(calls.some(c => c.table === 'contracts' && c.op === 'delete')).toBe(true);
    });
});
