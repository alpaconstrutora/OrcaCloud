import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pendências da Fase 3 (plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * excluir risco/cenário não conferia se o banco apagou (RLS recusa em silêncio) e o
 * erro de permissão chegava em inglês.
 */
const resposta = vi.hoisted(() => ({ data: null as unknown, error: null as null | { code?: string; message: string } }));
vi.mock('../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'delete', 'eq', 'insert', 'update', 'upsert']) q[m] = () => q;
    q.select = () => Promise.resolve({ data: resposta.data, error: resposta.error });
    (q as { then: unknown }).then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: resposta.data, error: resposta.error }).then(ok);
    return { supabase: q };
});

import { imovibService } from '../services/imovibService';

beforeEach(() => { resposta.data = null; resposta.error = null; });

describe('riscos e cenários — exclusão confere a RLS', () => {
    it('excluir risco que a RLS recusou (0 linhas) diz que não tem permissão', async () => {
        resposta.data = [];
        await expect(imovibService.excluirRisco('r1')).rejects.toThrow('Sem permissão para excluir riscos deste estudo.');
    });

    it('excluir cenário que a RLS recusou (0 linhas) diz que não tem permissão', async () => {
        resposta.data = [];
        await expect(imovibService.excluirCenario('c1')).rejects.toThrow('Sem permissão para excluir cenários deste estudo.');
    });

    it('excluir com sucesso não reclama', async () => {
        resposta.data = [{ id: 'r1' }];
        await expect(imovibService.excluirRisco('r1')).resolves.toBeUndefined();
    });
});

describe('riscos e cenários — erro de permissão em português', () => {
    it('salvar risco barrado pela RLS (42501) diz que não tem permissão, sem o texto em inglês', async () => {
        resposta.error = { code: '42501', message: 'new row violates row-level security policy for table "imovib_risks"' };
        const erro = await imovibService.salvarRisco({ study_id: 'e1', category: 'legal', description: 'x', probability: 1, impact: 1, status: 'aberto', sort_order: 0 } as never).catch(e => e as Error);
        expect((erro as Error).message).toBe('Sem permissão para salvar riscos deste estudo.');
    });

    it('salvar cenário barrado pela RLS (42501) diz que não tem permissão', async () => {
        resposta.error = { code: '42501', message: 'new row violates row-level security policy for table "imovib_scenarios"' };
        const erro = await imovibService.salvarCenario({ study_id: 'e1', name: 'X', kind: 'personalizado', choques: {}, sort_order: 0 } as never).catch(e => e as Error);
        expect((erro as Error).message).toBe('Sem permissão para salvar cenários deste estudo.');
    });
});
