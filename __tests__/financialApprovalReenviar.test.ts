import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    linha: { approval_status: 'REJEITADO', amount: 6000, organization_id: 'org-1' } as Record<string, unknown>,
    updates: [] as Record<string, unknown>[],
    filtros: [] as [string, unknown][],
}));

vi.mock('../lib/supabase', () => {
    const consulta = (modo: 'select' | 'update') => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = (col: string, val: unknown) => { if (modo === 'update') m.filtros.push([col, val]); return q; };
        q.single = async () => ({ data: m.linha, error: null });
        q.then = (ok: (v: unknown) => void) => ok({ error: null });
        return q;
    };
    return {
        supabase: {
            from: () => ({
                select: () => consulta('select'),
                update: (patch: Record<string, unknown>) => { m.updates.push(patch); return consulta('update'); },
            }),
        },
    };
});
vi.mock('../services/approvalService', () => ({
    approvalService: { resolveRequiredLevels: vi.fn(async () => ({ required_levels: 2, level1_label: 'Gestor', level2_label: 'Diretoria' })) },
}));
vi.mock('../services/processService', () => ({ processService: {} }));

import { financialApprovalService } from '../services/financialApprovalService';

describe('financialApprovalService.reenviar', () => {
    beforeEach(() => { m.updates = []; m.filtros = []; m.linha = { approval_status: 'REJEITADO', amount: 6000, organization_id: 'org-1' }; });

    it('rejeitado volta PENDENTE com os níveis da faixa e sai de BLOQUEADO, sem apagar a cadeia', async () => {
        await financialApprovalService.reenviar('t1');
        expect(m.updates).toHaveLength(1);
        expect(m.updates[0]).toMatchObject({ approval_status: 'PENDENTE', approval_required_levels: 2, business_status: null });
        expect(m.updates[0]).not.toHaveProperty('approval_chain');
        expect(m.filtros).toContainEqual(['approval_status', 'REJEITADO']);
    });

    it('recusa título que não está rejeitado', async () => {
        m.linha = { approval_status: 'APROVADO', amount: 10, organization_id: 'org-1' };
        await expect(financialApprovalService.reenviar('t1')).rejects.toThrow(/rejeitado/i);
        expect(m.updates).toHaveLength(0);
    });
});
