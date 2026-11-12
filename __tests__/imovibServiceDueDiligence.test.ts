/**
 * Due diligence: quem conferiu e quando mudam só com a situação (pendência da
 * Fase 5 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'usuario-1' } } } }) },
        from: () => ({
            update: (payload: Record<string, unknown>) => {
                banco.update(payload);
                return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'dd0', ...payload }], error: null }) }) };
            },
        }),
    },
}));

import { imovibService } from '../services/imovibService';

describe('salvarItemDaDueDiligence', () => {
    beforeEach(() => banco.update.mockReset());

    it('situação: grava quem e quando', async () => {
        await imovibService.salvarItemDaDueDiligence('dd0', { status: 'ok' });
        const p = banco.update.mock.calls[0][0];
        expect(p.status).toBe('ok');
        expect(p.checked_by).toBe('usuario-1');
        expect(typeof p.checked_at).toBe('string');
    });

    it('observação: não mexe em quem nem quando', async () => {
        await imovibService.salvarItemDaDueDiligence('dd0', { notes: 'matrícula pedida' });
        expect(banco.update).toHaveBeenCalledWith({ notes: 'matrícula pedida' });
    });

    it('voltar a pendente limpa quem e quando', async () => {
        await imovibService.salvarItemDaDueDiligence('dd0', { status: 'pendente' });
        expect(banco.update).toHaveBeenCalledWith({ status: 'pendente', checked_at: null, checked_by: null });
    });
});
