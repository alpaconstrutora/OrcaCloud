import { describe, it, expect, vi, beforeEach } from 'vitest';

// CPF é opcional no cadastro de colaborador. O índice único
// `idx_employees_cpf_unique (org_id, cpf) WHERE cpf IS NOT NULL` só ignora
// NULL: gravado como '' (o formulário manda o campo vazio assim), o segundo
// colaborador sem CPF da mesma organização batia em "duplicate key".
vi.mock('../lib/supabase', () => {
    const mockSingle = vi.fn();
    const mockSelect = vi.fn(() => ({ single: mockSingle }));
    const mockEq = vi.fn(() => ({ select: mockSelect }));
    const mockInsert = vi.fn(() => ({ select: mockSelect }));
    const mockUpdate = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }));
    return {
        supabase: { from: mockFrom, rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) },
        __mocks: { mockFrom, mockInsert, mockUpdate, mockSingle },
    };
});

import { laborService } from '../services/laborService';
import * as supabaseModule from '../lib/supabase';

const mocks = (supabaseModule as any).__mocks as {
    mockInsert: ReturnType<typeof vi.fn>;
    mockUpdate: ReturnType<typeof vi.fn>;
    mockSingle: ReturnType<typeof vi.fn>;
};

const base = { name: 'Fulano', role: 'Pedreiro', org_id: 'org-1', contract_type: 'PJ' } as any;

describe('laborService — colaborador sem CPF', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockSingle.mockResolvedValue({ data: { id: 'e1' }, error: null });
    });

    it.each(['', '   ', '...-'])('createEmployee grava CPF %j como NULL', async (cpf) => {
        await laborService.createEmployee({ ...base, cpf });
        expect(mocks.mockInsert.mock.calls[0][0].cpf).toBeNull();
    });

    it('createEmployee mantém o CPF informado', async () => {
        await laborService.createEmployee({ ...base, cpf: '123.456.789-09' });
        expect(mocks.mockInsert.mock.calls[0][0].cpf).toBe('123.456.789-09');
    });

    it('updateEmployee grava CPF apagado como NULL', async () => {
        await laborService.updateEmployee('e1', { cpf: '' } as any);
        expect(mocks.mockUpdate.mock.calls[0][0].cpf).toBeNull();
    });

    it('updateEmployee não inventa cpf quando o campo não veio', async () => {
        await laborService.updateEmployee('e1', { status: 'INACTIVE' } as any);
        expect('cpf' in mocks.mockUpdate.mock.calls[0][0]).toBe(false);
    });

    it('CPF repetido na organização vira mensagem legível', async () => {
        mocks.mockSingle.mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_employees_cpf_unique"' },
        });
        await expect(laborService.createEmployee({ ...base, cpf: '123.456.789-09' }))
            .rejects.toThrow('Já existe um colaborador com este CPF nesta organização.');
    });
});
