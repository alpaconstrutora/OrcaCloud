/**
 * Duplicar contrato (F14, 18/11/2026): a cópia é um contrato novo, em rascunho — a aprovação do
 * original não vai junto. Antes o insert espalhava a linha original inteira, com
 * approval_status/approval_chain; agora o banco recusa item que nasce aprovado ou com passos
 * (trg_alcada_guarda) e duplicar contrato aprovado quebraria.
 * Plano: docs/planos/2026-11-18-seguranca-alcada-no-servidor.md.
 */
import { describe, it, expect, vi } from 'vitest';

type Row = Record<string, unknown>;
const inserts: { table: string; payload: unknown }[] = [];

const ORIGINAL: Row = {
    id: 'c1', organization_id: 'org1', number: 'CT-001', title: 'Obra X', status: 'Ativo',
    current_value: 80000, approval_status: 'APROVADO', approval_required_levels: 2,
    approval_chain: [{ level: 1, action: 'APROVADO', approved_by: 'a@x' }, { level: 2, action: 'APROVADO', approved_by: 'b@x' }],
    created_at: '2026-01-01',
};

function table(name: string) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
        select: chain, eq: chain, in: chain, order: chain, limit: chain,
        insert: (payload: unknown) => { inserts.push({ table: name, payload }); return b; },
        single: async () => ({ data: name === 'contracts' && inserts.length === 0 ? ORIGINAL : { id: 'c2' }, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));

import { contractService } from '../services/contractService';

describe('contractService.duplicateContract — sem a aprovação do original', () => {
    it('a cópia nasce RASCUNHO, sem passos e com 1 nível', async () => {
        await contractService.duplicateContract('c1');
        const ins = inserts.find(i => i.table === 'contracts');
        expect(ins?.payload).toMatchObject({
            status: 'Rascunho', number: 'CT-001-COPY', title: 'Obra X (Cópia)',
            approval_status: 'RASCUNHO', approval_chain: [], approval_required_levels: 1,
        });
        expect((ins?.payload as Row).id).toBeUndefined();
    });
});
