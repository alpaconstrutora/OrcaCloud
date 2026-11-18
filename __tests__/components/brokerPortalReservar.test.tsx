// @vitest-environment jsdom
/**
 * "Reservar" do Portal do Corretor (18/11/2026, achados F5/F6/F7).
 *
 * Pelo portal (link ou login do corretor, `portalToken` presente) a reserva é a
 * RPC `fn_broker_portal_reservar_unidade`, que só troca o status. O UPDATE direto
 * em commercial_properties (`commercialService.saveProperty`) só passava para o
 * corretor porque ele contava como MEMBRO da organização — o ramo que a migration
 * aplicar_20271118913100 tira. Dentro do app (gestor, sem token) nada muda.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    reservarUnidade: vi.fn(async (_id: string) => {}),
    saveProperty: vi.fn(async (_p: unknown) => ({})),
}));

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => async () => true }));
vi.mock('../../store/useStore', () => ({ useStore: () => ({ organizations: [] }) }));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: null }) }));
vi.mock('../../services/brokerPortalService', () => ({
    brokerPortalService: {
        reservarUnidade: m.reservarUnidade,
        getUnitsByToken: vi.fn(async () => []),
        getProposalsByToken: vi.fn(async () => []),
        getCommissionsByToken: vi.fn(async () => []),
    },
}));
vi.mock('../../services/commercialService', () => ({
    commercialService: { saveProperty: m.saveProperty, listProperties: vi.fn(async () => []), listDeals: vi.fn(async () => []) },
}));
vi.mock('../../services/brokerService', () => ({
    brokerService: {
        listEnabledPropertyIds: vi.fn(async () => null), listProfiles: vi.fn(async () => []),
        listProposals: vi.fn(async () => []), listCommissions: vi.fn(async () => []),
    },
}));
vi.mock('../../services/proposalPdfService', () => ({ downloadProposalPdf: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import { useBrokerPortal } from '../../components/broker/useBrokerPortal';

const unidade = { id: 'u-101', number: '101', name: 'Apto 101', status: 'AVAILABLE' } as never;

beforeEach(() => {
    m.reservarUnidade.mockReset();
    m.reservarUnidade.mockResolvedValue(undefined);
    m.saveProperty.mockReset();
    m.saveProperty.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useBrokerPortal › handleReserve', () => {
    it('pelo portal (token): RPC que só muda o status, nunca o UPDATE direto', async () => {
        const { result } = renderHook(() => useBrokerPortal({
            profile: { group: 'CORRETOR', role: '', email: 'k@corretor.com' },
            organizationId: 'org-1', portalToken: 'tok-1', isPreview: true,
        }));
        await act(async () => { await result.current.handleReserve(unidade); });
        expect(m.reservarUnidade).toHaveBeenCalledWith('u-101');
        expect(m.saveProperty).not.toHaveBeenCalled();
        expect(result.current.shareMsg).toBe('Unidade 101 reservada por 48h.');
    });

    it('pelo portal, recusa da RPC (sem login/sem acesso) mostra o mesmo aviso de erro de antes', async () => {
        m.reservarUnidade.mockRejectedValue(new Error('unidade_sem_acesso'));
        const { result } = renderHook(() => useBrokerPortal({
            profile: { group: 'CORRETOR', role: '', email: 'k@corretor.com' },
            organizationId: 'org-1', portalToken: 'tok-1', isPreview: true,
        }));
        await act(async () => { await result.current.handleReserve(unidade); });
        expect(result.current.shareMsg).toBe('Erro ao reservar a unidade. Tente novamente.');
    });

    it('dentro do app (gestor, sem token): o caminho de sempre', async () => {
        const { result } = renderHook(() => useBrokerPortal({
            profile: { group: 'DESENVOLVEDOR', role: 'ADMINISTRADOR', email: 'gestor@a.com' },
            organizationId: 'org-1',
        }));
        await act(async () => { await result.current.handleReserve(unidade); });
        expect(m.saveProperty).toHaveBeenCalledWith({ id: 'u-101', status: 'RESERVED' });
        expect(m.reservarUnidade).not.toHaveBeenCalled();
    });
});
