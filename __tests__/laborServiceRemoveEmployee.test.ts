import { describe, it, expect, vi, beforeEach } from 'vitest';

// Excluir colaborador: a RLS de `employees` (employees_delete, migration
// aplicar_20271117910000) só deixa apagar quem é membro da organização DONA. Para os outros o
// DELETE não dá erro — apaga 0 linhas — e a tela anunciava "Colaborador excluído.". O serviço
// pede de volta o que apagou e trata 0 linhas como falha.
vi.mock('../lib/supabase', () => {
    const mockSelect = vi.fn();
    const mockEq = vi.fn(() => ({ select: mockSelect }));
    const mockDelete = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ delete: mockDelete }));
    return {
        supabase: { from: mockFrom, rpc: vi.fn() },
        __mocks: { mockFrom, mockDelete, mockEq, mockSelect },
    };
});

import { laborService } from '../services/laborService';
import * as supabaseModule from '../lib/supabase';

const mocks = (supabaseModule as any).__mocks as {
    mockEq: ReturnType<typeof vi.fn>;
    mockSelect: ReturnType<typeof vi.fn>;
};

describe('laborService.removeEmployee', () => {
    beforeEach(() => vi.clearAllMocks());

    it('apagou a linha: resolve', async () => {
        mocks.mockSelect.mockResolvedValue({ data: [{ id: 'e1' }], error: null });
        await expect(laborService.removeEmployee('e1')).resolves.toBeUndefined();
        expect(mocks.mockEq).toHaveBeenCalledWith('id', 'e1');
    });

    it('nenhuma linha apagada (sem permissão pela RLS): falha com o motivo, em vez de anunciar sucesso', async () => {
        mocks.mockSelect.mockResolvedValue({ data: [], error: null });
        await expect(laborService.removeEmployee('e2')).rejects.toThrow(
            'Colaborador não excluído: só quem é membro da organização dona do colaborador pode excluí-lo.');
    });

    it('erro do banco segue o caminho de antes (ex.: 23503 de registro vinculado)', async () => {
        const erro = { code: '23503', message: 'violates foreign key constraint' };
        mocks.mockSelect.mockResolvedValue({ data: null, error: erro });
        await expect(laborService.removeEmployee('e1')).rejects.toBe(erro);
    });
});
