import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Estes testes verificavam uma implementação que não existe mais e ficaram
 * vermelhos no CI (2026-08-03):
 *
 *   • `listWorkspaces` passou a usar `.or(...)` para incluir parceiros GLOBAIS
 *     (organization_id NULL) junto com os da organização — o mock só tinha
 *     `.eq()`, então quebrava com "query.or is not a function".
 *   • `listConversations` e `listRequests` passaram a chamar RPC
 *     (`partner_get_conversations` / `partner_get_requests`, migration
 *     20270863000000) para compartilhar a implementação com o link público —
 *     o mock não tinha `supabase.rpc`, daí "supabase.rpc is not a function".
 *
 * Reescritos para o comportamento atual. O filtro por organização é o mesmo
 * padrão de `useOrgContext`: sem organização ("Todas"), não filtra nada e
 * deixa a RLS recortar.
 */

vi.mock('../lib/supabase', () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockOr = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder, eq: vi.fn().mockReturnValue({ order: mockOrder }) });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, or: mockOr, order: mockOrder });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockRpc = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });

    return {
        supabase: { from: mockFrom, rpc: mockRpc },
        __mocks: { mockFrom, mockSelect, mockEq, mockOr, mockOrder, mockRpc },
    };
});

import { partnerService } from '../services/partnerService';
import * as supabaseModule from '../lib/supabase';

const mocks = (supabaseModule as any).__mocks as {
    mockFrom: ReturnType<typeof vi.fn>;
    mockSelect: ReturnType<typeof vi.fn>;
    mockEq: ReturnType<typeof vi.fn>;
    mockOr: ReturnType<typeof vi.fn>;
    mockOrder: ReturnType<typeof vi.fn>;
    mockRpc: ReturnType<typeof vi.fn>;
};

describe('partnerService API Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockOrder.mockResolvedValue({ data: [], error: null });
        mocks.mockOr.mockReturnValue({ order: mocks.mockOrder });
        mocks.mockEq.mockReturnValue({ order: mocks.mockOrder, eq: vi.fn().mockReturnValue({ order: mocks.mockOrder }) });
        mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq, or: mocks.mockOr, order: mocks.mockOrder });
        mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
        mocks.mockRpc.mockResolvedValue({ data: { data: [] }, error: null });
    });

    it('listWorkspaces filtra pela organização E inclui parceiros compartilhados', async () => {
        await partnerService.listWorkspaces('org-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_workspaces');
        // Era `organization_id.is.null`: o compartilhamento vivia na AUSÊNCIA de
        // dono, e a policy `organization_id IS NULL OR is_org_member(...)` dava
        // leitura E ESCRITA da linha a qualquer inquilino. Agora o parceiro
        // compartilhado tem dono e `is_shared = true` — ver
        // docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
        expect(mocks.mockOr).toHaveBeenCalledWith(
            'organization_id.eq.org-123,is_shared.is.true',
        );
    });

    it('listWorkspaces sem organização ("Todas") não aplica filtro', async () => {
        await partnerService.listWorkspaces();
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_workspaces');
        expect(mocks.mockOr).not.toHaveBeenCalled();
        expect(mocks.mockOrder).toHaveBeenCalled();
    });

    it('listPartnerUsers chama select com filtro de partner_workspace_id', async () => {
        await partnerService.listPartnerUsers('ws-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_users');
        expect(mocks.mockEq).toHaveBeenCalledWith('partner_workspace_id', 'ws-123');
    });

    it('listConversations usa a RPC partner_get_conversations', async () => {
        await partnerService.listConversations('ws-123');
        expect(mocks.mockRpc).toHaveBeenCalledWith('partner_get_conversations', {
            p_workspace_id: 'ws-123',
        });
    });

    it('listRequests usa a RPC partner_get_requests', async () => {
        await partnerService.listRequests('ws-123');
        expect(mocks.mockRpc).toHaveBeenCalledWith('partner_get_requests', {
            p_workspace_id: 'ws-123',
        });
    });
});
