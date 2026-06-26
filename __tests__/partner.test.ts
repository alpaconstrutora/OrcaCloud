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

import { partnerService } from '../services/partnerService';
import * as supabaseModule from '../lib/supabase';

// Acessa os mocks via cast
const mocks = (supabaseModule as any).__mocks as {
    mockFrom: ReturnType<typeof vi.fn>;
    mockSelect: ReturnType<typeof vi.fn>;
    mockEq: ReturnType<typeof vi.fn>;
    mockOrder: ReturnType<typeof vi.fn>;
};

describe('partnerService API Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reconfigura a cadeia de chamadas padrão do query builder do Supabase
        mocks.mockOrder.mockResolvedValue({ data: [], error: null });
        mocks.mockEq.mockReturnValue({ order: mocks.mockOrder });
        mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq, order: mocks.mockOrder });
        mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
    });

    it('listWorkspaces chama select com filtro de organization_id', async () => {
        await partnerService.listWorkspaces('org-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_workspaces');
        expect(mocks.mockEq).toHaveBeenCalledWith('organization_id', 'org-123');
    });

    it('listPartnerUsers chama select com filtro de partner_workspace_id', async () => {
        // Redefine mockEq para retornar a si mesmo ou mockOrder de forma simples
        mocks.mockEq.mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) });
        await partnerService.listPartnerUsers('ws-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_users');
        expect(mocks.mockEq).toHaveBeenCalledWith('partner_workspace_id', 'ws-123');
    });

    it('listConversations chama select com filtro de partner_workspace_id', async () => {
        mocks.mockEq.mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) });
        await partnerService.listConversations('ws-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_conversations');
        expect(mocks.mockEq).toHaveBeenCalledWith('partner_workspace_id', 'ws-123');
    });

    it('listRequests chama select com filtro de partner_workspace_id', async () => {
        await partnerService.listRequests('ws-123');
        expect(mocks.mockFrom).toHaveBeenCalledWith('partner_requests');
        expect(mocks.mockEq).toHaveBeenCalledWith('partner_workspace_id', 'ws-123');
    });
});
