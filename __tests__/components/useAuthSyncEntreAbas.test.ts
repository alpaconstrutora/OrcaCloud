// @vitest-environment jsdom
/**
 * useAuthSync — portal que não combina: só a aba que FEZ o login desconecta.
 *
 * 03/10/2026, "entra e cai": uma aba parada em /portal-parceiro (link do convite)
 * recebia a sessão feita em outra aba pela Área do Desenvolvedor, conferia como
 * parceiro, recusava e chamava signOut (global) — derrubando a aba onde a pessoa
 * tinha acabado de entrar. Reproduzido no navegador com duas abas.
 *
 * Trava:
 *  1. sessão vinda de outra aba + portal que não combina → NÃO desconecta, sem
 *     tela de erro; adota o portal gravado pela aba do login;
 *  2. sem portal gravado → esta aba volta ao seletor (portal nenhum), sem desconectar;
 *  3. login feito NESTA aba + portal que não combina → mostra o motivo e desconecta
 *     depois de 3 s (comportamento de sempre);
 *  4. a marca "login nesta aba" some quando a sessão termina.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const signOut = vi.fn(async () => ({ error: null }));
let authCallback: ((event: string, session: unknown) => void) | null = null;
const validateAccess = vi.fn();

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(async () => ({ data: { session: null } })),
            onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
                authCallback = cb;
                return { data: { subscription: { unsubscribe: vi.fn() } } };
            }),
            signOut: () => signOut(),
        },
    },
}));
vi.mock('../../services/profileService', () => ({
    profileService: { validateAccess: (...a: unknown[]) => validateAccess(...a) },
}));
vi.mock('../../services/investorService', () => ({ investorService: { getByEmail: vi.fn() } }));
vi.mock('../../services/clientService', () => ({ clientService: { getByEmail: vi.fn() } }));
vi.mock('../../services/supplierService', () => ({ supplierService: { getByEmail: vi.fn() } }));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: vi.fn(async () => []) } }));

import { useAuthSync } from '../../hooks/useAuthSync';
import { marcarLoginNestaAba, loginFeitoNestaAba } from '../../lib/loginNestaAba';
import { ProfileGroup } from '../../types';

const SESSAO = { user: { id: 'u1', email: 'altair.rosa@alpaconstrutora.com.br' } };

function montar(selectedLoginGroup: ProfileGroup | null) {
    const props = {
        session: SESSAO,
        setSession: vi.fn(),
        setLoadingSession: vi.fn(),
        selectedLoginGroup,
        setSelectedLoginGroup: vi.fn(),
        selectLoginGroupForRoute: vi.fn(),
        setAuthError: vi.fn(),
        setIsResettingPassword: vi.fn(),
        profileSynchronized: false,
        setProfileSynchronized: vi.fn(),
        currentProfile: { group: null, email: null },
        setCurrentProfile: vi.fn(),
        setIsValidating: vi.fn(),
        setInvestorProfile: vi.fn(),
        setClientProfile: vi.fn(),
        setSupplierProfile: vi.fn(),
        fetchProjects: vi.fn(),
        fetchClients: vi.fn(),
        fetchOrganizations: vi.fn(),
        projectId: null,
        clientProfile: null,
        investorProfile: null,
        handleLoadProject: vi.fn(async () => null),
    };
    renderHook(() => useAuthSync(props as unknown as Parameters<typeof useAuthSync>[0]));
    return props;
}

describe('useAuthSync — sessão compartilhada entre abas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        validateAccess.mockResolvedValue({ isValid: false, error: 'Este e-mail está reservado apenas para o Portal do Desenvolvedor.' });
    });
    afterEach(() => { vi.useRealTimers(); });

    it('1. sessão de outra aba: não desconecta e adota o portal gravado pela aba do login', async () => {
        localStorage.setItem('orca_selectedLoginGroup', ProfileGroup.DEVELOPER);
        const p = montar(ProfileGroup.PARTNER);

        await waitFor(() => expect(p.selectLoginGroupForRoute).toHaveBeenCalledWith(ProfileGroup.DEVELOPER));
        expect(p.setAuthError).not.toHaveBeenCalledWith(expect.stringContaining('reservado'));
        await new Promise(r => setTimeout(r, 3300));
        expect(signOut).not.toHaveBeenCalled();
    }, 10000);

    it('2. sessão de outra aba sem portal gravado: volta ao seletor, sem desconectar', async () => {
        const p = montar(ProfileGroup.PARTNER);

        await waitFor(() => expect(p.selectLoginGroupForRoute).toHaveBeenCalledWith(null));
        await new Promise(r => setTimeout(r, 3300));
        expect(signOut).not.toHaveBeenCalled();
    }, 10000);

    it('3. login feito nesta aba: mostra o motivo e desconecta após 3 s', async () => {
        marcarLoginNestaAba();
        const p = montar(ProfileGroup.PARTNER);

        await waitFor(() => expect(p.setAuthError).toHaveBeenCalledWith('Este e-mail está reservado apenas para o Portal do Desenvolvedor.'));
        expect(p.selectLoginGroupForRoute).not.toHaveBeenCalled();
        await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1), { timeout: 4500 });
    }, 10000);

    it('4. a marca "login nesta aba" some quando a sessão termina', async () => {
        validateAccess.mockResolvedValue({ isValid: true });
        marcarLoginNestaAba();
        montar(ProfileGroup.DEVELOPER);
        expect(loginFeitoNestaAba()).toBe(true);

        act(() => { authCallback?.('SIGNED_OUT', null); });
        expect(loginFeitoNestaAba()).toBe(false);
    });
});
