import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ linhas: [] as { id: string; approval_status: string }[] }));

vi.mock('../lib/supabase', () => {
    const consulta: Record<string, unknown> = {};
    consulta.select = () => consulta;
    consulta.eq = () => consulta;
    consulta.in = () => consulta;
    consulta.limit = async () => ({ data: m.linhas, error: null });
    return { supabase: { from: () => consulta } };
});

import { boletoService } from '../services/boletoService';
import { MOTIVO_ALCADA_PENDENTE, MOTIVO_ALCADA_REJEITADA } from '../utils/situacaoAprovacaoTitulo';

describe('boletoService.motivoDaAlcada', () => {
    beforeEach(() => { m.linhas = []; });

    it('título pendente → motivo de aguardando aprovação', async () => {
        m.linhas = [{ id: 't1', approval_status: 'PENDENTE' }];
        await expect(boletoService.motivoDaAlcada('b1')).resolves.toBe(MOTIVO_ALCADA_PENDENTE);
    });

    it('título rejeitado → motivo de bloqueado', async () => {
        m.linhas = [{ id: 't1', approval_status: 'REJEITADO' }];
        await expect(boletoService.motivoDaAlcada('b1')).resolves.toBe(MOTIVO_ALCADA_REJEITADA);
    });

    it('sem título travado → null', async () => {
        await expect(boletoService.motivoDaAlcada('b1')).resolves.toBeNull();
    });

    it('marcarPago recusa boleto com título rejeitado antes de gravar', async () => {
        m.linhas = [{ id: 't1', approval_status: 'REJEITADO' }];
        await expect(boletoService.marcarPago('b1', 'org-1')).rejects.toThrow(MOTIVO_ALCADA_REJEITADA);
    });
});
