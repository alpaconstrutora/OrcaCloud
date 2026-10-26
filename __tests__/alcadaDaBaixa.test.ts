import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({ approval_status: null as string | null }));

vi.mock('../lib/supabase', () => {
    const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: async () => ({ data: { id: 't1', approval_status: estado.approval_status }, error: null }),
    };
    return { supabase: { from: () => consulta } };
});

import { exigirAlcadaLiberada, MOTIVO_ALCADA_PENDENTE, MOTIVO_ALCADA_REJEITADA } from '../services/alcadaDaBaixa';

describe('exigirAlcadaLiberada', () => {
    beforeEach(() => { estado.approval_status = null; });

    it('recusa título pendente', async () => {
        estado.approval_status = 'PENDENTE';
        await expect(exigirAlcadaLiberada('t1')).rejects.toThrow(MOTIVO_ALCADA_PENDENTE);
    });

    it('recusa título rejeitado (Bloqueado)', async () => {
        estado.approval_status = 'REJEITADO';
        await expect(exigirAlcadaLiberada('t1')).rejects.toThrow(MOTIVO_ALCADA_REJEITADA);
    });

    it.each(['APROVADO', 'RASCUNHO', null])('libera %s', async (st) => {
        estado.approval_status = st;
        await expect(exigirAlcadaLiberada('t1')).resolves.toBeUndefined();
    });
});
