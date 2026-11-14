// @vitest-environment jsdom
/**
 * Meus Clientes › editar o nome e salvar → pergunta "Propagar … pelo app?".
 *
 * Tela de verdade (ClientList → ClientForm → ConfirmProvider real); só os
 * serviços são simulados. Os testes de #405 cobriam as funções puras e o
 * serviço, nunca a ligação da tela com a pergunta. Relato de 14/11/2026:
 * "alterei o nome salve e nao perguntou".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { cadeia } = vi.hoisted(() => {
    const c: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'order', 'is', 'not', 'limit', 'match', 'maybeSingle', 'single', 'update'].forEach(m => { c[m] = () => c; });
    c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, erro);
    return { cadeia: c };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => cadeia, rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } } }));
vi.mock('../../store/useStore', () => {
    const estado = { activeOrganizationId: 'org1', organizations: [{ id: 'org1', name: 'Alpa' }], projects: [], companies: [], viewFocus: null, setViewFocus: () => {}, fetchProjects: vi.fn() };
    const useStore = (sel?: (s: unknown) => unknown) => (sel ? sel(estado) : estado);
    useStore.getState = () => estado;
    return { useStore };
});
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
    useDefaultWriteOrgId: () => 'org1',
}));

const CLIENTES = [
    { id: 'c1', code: 'CLI-001', name: 'Filtrelec', type: 'PJ', category: 'Vendas', status: 'Ativo', portal: 'Nenhum', organization_id: 'org1', organization_name: 'Alpa' },
];
const saveClient = vi.fn(async (d: Record<string, unknown>) => ({ ...CLIENTES[0], ...d }));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: vi.fn(async () => CLIENTES), saveClient: (d: Record<string, unknown>) => saveClient(d) } }));
vi.mock('../../services/clientCategoryService', () => ({ clientCategoryService: { list: vi.fn(async () => [{ id: 'k1', name: 'Vendas' }]) } }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { mapObrasToEmpreendimentos: vi.fn(async () => ({})), list: vi.fn(async () => []) } }));
vi.mock('../../services/clientEmpreendimentoService', () => ({ clientEmpreendimentoService: {
    listByClients: vi.fn(async () => ({})), listIdsByClient: vi.fn(async () => []), setForClient: vi.fn(async () => undefined),
} }));
vi.mock('../../services/clientMessagesService', () => ({ clientMessagesService: { sendMessage: vi.fn() } }));
vi.mock('../../services/masterDataService', () => ({ masterDataService: { listStates: vi.fn(async () => []) } }));
vi.mock('../../components/CityStateSelect', () => ({ default: () => null }));

const planejar = vi.fn();
const aplicar = vi.fn(async () => ({ atualizados: 36, recusados: 0, obrasAlteradas: false }));
vi.mock('../../services/clientPropagacaoService', async (orig) => {
    const real = await orig<typeof import('../../services/clientPropagacaoService')>();
    return { ...real, clientPropagacaoService: { planejar: (...a: unknown[]) => planejar(...a), aplicar: (...a: unknown[]) => aplicar(...a) } };
});

import ClientList from '../../components/ClientList';
import { ConfirmProvider } from '../../components/ui/confirm';

const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ tabela: 'internal_transactions', id: `t${i}`, patch: { party_name: 'Filtrelec Comércio' } }));

async function editarNomeESalvar(novoNome: string) {
    render(<ConfirmProvider><ClientList organizationId="org1" /></ConfirmProvider>);
    await screen.findAllByText('Filtrelec');
    fireEvent.click(screen.getAllByTitle('Editar')[0]);
    const campo = await screen.findByDisplayValue('Filtrelec');
    fireEvent.change(campo, { target: { value: novoNome } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(saveClient).toHaveBeenCalled());
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('Meus Clientes › propagar a edição', () => {
    it('renomear um cliente com cópias pergunta e, ao confirmar, propaga', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Filtrelec Comércio' }, porDestino: { financeiro: linhas(36) } });
        await editarNomeESalvar('Filtrelec Comércio');
        expect(planejar).toHaveBeenCalledWith('c1', { name: 'Filtrelec Comércio' });
        expect(await screen.findByText('Propagar o nome pelo app?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Propagar' }));
        await waitFor(() => expect(aplicar).toHaveBeenCalled());
    });

    // O caso do relato: cliente sem cópia em lugar nenhum. Antes a tela ficava
    // calada e parecia que a pergunta tinha quebrado.
    it('renomear um cliente SEM cópias avisa que não havia nada a propagar', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Filtrelec Comércio' }, porDestino: {} });
        await editarNomeESalvar('Filtrelec Comércio');
        expect(await screen.findByText(/nenhum outro registro do app guarda cópia do nome/i)).toBeTruthy();
        expect(screen.queryByText('Propagar o nome pelo app?')).toBeNull();
    });

    it('falha ao procurar as cópias avisa, em vez de sumir com a pergunta', async () => {
        planejar.mockRejectedValue(new Error('rede'));
        await editarNomeESalvar('Filtrelec Comércio');
        expect(await screen.findByText(/não foi possível verificar onde mais o nome aparece/i)).toBeTruthy();
    });

    it('salvar sem mudar nome nem e-mail não procura cópias nem avisa', async () => {
        render(<ConfirmProvider><ClientList organizationId="org1" /></ConfirmProvider>);
        await screen.findAllByText('Filtrelec');
        fireEvent.click(screen.getAllByTitle('Editar')[0]);
        await screen.findByDisplayValue('Filtrelec');
        fireEvent.change(screen.getByDisplayValue('CLI-001'), { target: { value: 'CLI-002' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
        await waitFor(() => expect(saveClient).toHaveBeenCalled());
        expect(planejar).not.toHaveBeenCalled();
        expect(screen.queryByText(/nada a propagar|nenhum outro registro/i)).toBeNull();
    });
});
