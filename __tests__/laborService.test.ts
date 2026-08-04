import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do módulo supabase antes de qualquer import que o use
vi.mock('../lib/supabase', () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    // `.eq()` precisa resolver sozinho (employee_org_shares) e também encadear
    // `.order()` — daí o `then` no retorno.
    const mockEq = vi.fn().mockReturnValue({
        order: mockOrder,
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
    });
    const mockOr = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, or: mockOr, order: mockOrder });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    return {
        supabase: { from: mockFrom },
        __mocks: { mockFrom, mockSelect, mockEq, mockOr, mockOrder },
    };
});

import { laborService } from '../services/laborService';
import * as supabaseModule from '../lib/supabase';

// Acessa os mocks via cast (o vi.mock garante que estão presentes)
const mocks = (supabaseModule as any).__mocks as {
    mockFrom: ReturnType<typeof vi.fn>;
    mockSelect: ReturnType<typeof vi.fn>;
    mockEq: ReturnType<typeof vi.fn>;
    mockOr: ReturnType<typeof vi.fn>;
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
        mocks.mockEq.mockReturnValue({
            order: mocks.mockOrder,
            then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
        });
        mocks.mockOr.mockReturnValue({ order: mocks.mockOrder });
        mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq, or: mocks.mockOr, order: mocks.mockOrder });
        mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
    });

    it('com orgId="all" NÃO chama .eq("org_id", ...) — retorna todos os funcionários', async () => {
        await laborService.listEmployees('all');
        // .eq não deve ser chamado quando orgId é 'all'
        expect(mocks.mockEq).not.toHaveBeenCalled();
    });

    // O service passou a devolver os colaboradores PRÓPRIOS da organização mais
    // os COMPARTILHADOS com ela (employee_org_shares), então o filtro virou um
    // `.or(...)`. O teste antigo ainda esperava `.eq('org_id', …)` e quebrava
    // com "supabase.from(...).select(...).or is not a function".
    it('com orgId específico filtra por org_id via .or (inclui compartilhados)', async () => {
        await laborService.listEmployees('org-123');
        expect(mocks.mockEq).toHaveBeenCalledWith('target_org_id', 'org-123'); // busca os compartilhados
        expect(mocks.mockOr).toHaveBeenCalledWith('org_id.eq.org-123');
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
