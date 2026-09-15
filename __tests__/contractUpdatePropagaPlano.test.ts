/**
 * Suprimentos › Contratos › editar: plano de contas / centro de custo alterados
 * no contrato descem para os títulos PENDENTES — e só quando mudaram de fato
 * (o modal manda o formulário inteiro; propagar sempre sobrescreveria parcela
 * reclassificada à mão). Pedido de 2026-09-14 (Relatórios › Plano de Contas).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: { table: string; op: string; args?: unknown; filters: unknown[] }[] = [];
let antes: Record<string, unknown> = {};

function table(name: string) {
    const rec = { table: name, op: '', args: undefined as unknown, filters: [] as unknown[] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    Object.assign(b, {
        select: () => { if (!rec.op) rec.op = 'select'; return b; },
        update: (payload: unknown) => { rec.op = 'update'; rec.args = payload; calls.push(rec); return b; },
        eq: filt, in: filt, like: filt,
        maybeSingle: async () => ({ data: antes, error: null }),
        single: async () => ({ data: { id: 'c1', organization_id: 'org1', ...(rec.args as object) }, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));

import { contractService } from '../services/contractService';

const propagacao = () => calls.find(c => c.table === 'internal_transactions' && c.op === 'update');

describe('contractService.updateContract — classificação desce para os títulos', () => {
    beforeEach(() => { calls.length = 0; });

    it('plano mudou → títulos PENDING do contrato recebem o plano novo', async () => {
        antes = { plano_de_contas_id: null, cost_center_id: 'cc1' };
        await contractService.updateContract('c1', { plano_de_contas_id: 'pc9', cost_center_id: 'cc1' } as never);
        const p = propagacao();
        expect(p?.args).toEqual({ plano_de_contas_id: 'pc9' }); // só o que mudou
        expect(JSON.stringify(p?.filters)).toContain('"status","PENDING"');
        expect(JSON.stringify(p?.filters)).toContain('"c1%"');
    });

    it('nada mudou → não toca nos títulos', async () => {
        antes = { plano_de_contas_id: 'pc9', cost_center_id: 'cc1' };
        await contractService.updateContract('c1', { plano_de_contas_id: 'pc9', cost_center_id: 'cc1', title: 'x' } as never);
        expect(propagacao()).toBeUndefined();
    });

    it('edição sem campos de classificação → nem consulta o contrato anterior', async () => {
        await contractService.updateContract('c1', { title: 'y' } as never);
        expect(propagacao()).toBeUndefined();
    });
});
