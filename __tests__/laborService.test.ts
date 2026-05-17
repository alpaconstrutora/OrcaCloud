import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do módulo supabase antes de qualquer import que o use
vi.mock('../lib/supabase', () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, order: mockOrder });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    return {
        supabase: { from: mockFrom },
        __mocks: { mockFrom, mockSelect, mockEq, mockOrder },
    };
});

import { laborService } from '../services/laborService';
import * as supabaseModule from '../lib/supabase';

// Acessa os mocks via cast (o vi.mock garante que estão presentes)
const mocks = (supabaseModule as any).__mocks as {
    mockFrom: ReturnType<typeof vi.fn>;
    mockSelect: ReturnType<typeof vi.fn>;
    mockEq: ReturnType<typeof vi.fn>;
    mockOrder: ReturnType<typeof vi.fn>;
};

/**
 * Reproduz o fluxo corrigido em LaborModule:
 *   selectedOrgId === undefined (inicial) → orgId = activeOrganizationId || 'all'
 *   usuário seleciona "Todas" no dropdown → selectedOrgId = 'all' → orgId = 'all'
 * Em ambos os casos listEmployees NÃO deve filtrar por org_id.
 */
describe('laborService.listEmployees — orgId === "all"', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reconfigura a cadeia após o clearAllMocks
        mocks.mockOrder.mockResolvedValue({ data: [], error: null });
        mocks.mockEq.mockReturnValue({ order: mocks.mockOrder });
        mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq, order: mocks.mockOrder });
        mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
    });

    it('com orgId="all" NÃO chama .eq("org_id", ...) — retorna todos os funcionários', async () => {
        await laborService.listEmployees('all');
        // .eq não deve ser chamado quando orgId é 'all'
        expect(mocks.mockEq).not.toHaveBeenCalled();
    });

    it('com orgId específico chama .eq("org_id", orgId)', async () => {
        await laborService.listEmployees('org-123');
        expect(mocks.mockEq).toHaveBeenCalledWith('org_id', 'org-123');
    });

    it('sem orgId (undefined) NÃO filtra por org — retorna todos', async () => {
        await laborService.listEmployees(undefined);
        expect(mocks.mockEq).not.toHaveBeenCalled();
    });

    it('com orgId="all" chama .order("name") para ordenar resultado', async () => {
        await laborService.listEmployees('all');
        expect(mocks.mockOrder).toHaveBeenCalledWith('name');
    });
});
