// @vitest-environment jsdom
/**
 * Meus Fornecedores › editar o nome e salvar → "Propagar o nome pelo app?".
 * Pedido de 14/11/2026: "implemente a mesma funcionalidade em minha
 * organização > meus fornecedores" (a de Meus Clientes, #405/#432).
 *
 * Tela de verdade (SupplierList → SupplierForm → ConfirmProvider real); só os
 * serviços são simulados.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { cadeia } = vi.hoisted(() => {
    const c: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'or', 'order', 'is', 'not', 'limit', 'match', 'maybeSingle', 'single', 'update'].forEach(m => { c[m] = () => c; });
    c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, erro);
    return { cadeia: c };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => cadeia, rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() } } }));
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

const FORNECEDOR = { id: 'f1', name: 'Cimento Forte', type: 'PJ', category: 'Materiais', organization_id: 'org1', organization_name: 'Alpa', portal: 'Nenhum' };
const updateSupplier = vi.fn(async () => undefined);
vi.mock('../../services/supplierService', () => ({
    supplierService: {
        listSuppliers: vi.fn(async () => [FORNECEDOR]),
        updateSupplier: (...a: unknown[]) => updateSupplier(...(a as [])),
        lookupCnpjRegistration: vi.fn(), syncRealEstateBrokerProfile: vi.fn(),
    },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }), save: vi.fn() } }));
vi.mock('../../services/supplierCategoryService', () => ({ supplierCategoryService: { listCategories: vi.fn(async () => []) } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: vi.fn(async () => []) } }));
vi.mock('../../components/SupplierBankAccountsTab', () => ({ default: () => null }));
vi.mock('../../components/CityStateSelect', () => ({ default: () => null }));

const planejar = vi.fn();
vi.mock('../../services/supplierPropagacaoService', () => ({ supplierPropagacaoService: { planejar: (...a: unknown[]) => planejar(...a) } }));
const aplicar = vi.fn(async () => ({ atualizados: 3, recusados: 0, obrasAlteradas: false }));
vi.mock('../../services/clientPropagacaoService', async (orig) => {
    const real = await orig<typeof import('../../services/clientPropagacaoService')>();
    return { ...real, clientPropagacaoService: { ...real.clientPropagacaoService, aplicar: (...a: unknown[]) => aplicar(...a) } };
});

import { SupplierList } from '../../components/SupplierList';
import { ConfirmProvider } from '../../components/ui/confirm';

const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ tabela: 'internal_transactions', id: `t${i}`, patch: { party_name: 'Cimento Forte Ltda' } }));

async function abrirEdicao() {
    render(<ConfirmProvider><SupplierList organizationId="org1" /></ConfirmProvider>);
    // Editar = clique na linha (a ação dominante da lista).
    const celula = (await screen.findAllByText('Cimento Forte'))[0];
    fireEvent.click(celula.closest('tr') ?? celula);
    return screen.findByDisplayValue('Cimento Forte');
}
async function renomearESalvar(campo: HTMLElement, novo: string) {
    fireEvent.change(campo, { target: { value: novo } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('Meus Fornecedores › propagar a edição', () => {
    it('renomear com cópias no financeiro pergunta e, ao confirmar, propaga', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Cimento Forte Ltda' }, porDestino: { financeiro: linhas(3) } });
        await renomearESalvar(await abrirEdicao(), 'Cimento Forte Ltda');
        await waitFor(() => expect(updateSupplier).toHaveBeenCalled());
        expect(planejar).toHaveBeenCalledWith('f1', { name: 'Cimento Forte Ltda' });
        expect(await screen.findByText('Propagar o nome pelo app?')).toBeTruthy();
        expect(screen.getByText(/Financeiro \(contas a receber\/pagar\): 3 lançamentos/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Propagar' }));
        await waitFor(() => expect(aplicar).toHaveBeenCalled());
        expect(await screen.findByText('Propagado: 3 registro(s) atualizado(s).')).toBeTruthy();
    });

    it('sem cópias avisa "nada a propagar"', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Cimento Forte Ltda' }, porDestino: {} });
        await renomearESalvar(await abrirEdicao(), 'Cimento Forte Ltda');
        expect(await screen.findByText(/nenhum outro registro do app guarda cópia do nome deste fornecedor/i)).toBeTruthy();
        expect(screen.queryByText('Propagar o nome pelo app?')).toBeNull();
    });

    it('rascunhos de conta a pagar aparecem como mantidos na pergunta', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Cimento Forte Ltda' }, porDestino: { financeiro: linhas(2) }, rascunhosMantidos: 4 });
        await renomearESalvar(await abrirEdicao(), 'Cimento Forte Ltda');
        expect(await screen.findByText(/4 conta\(s\) a pagar em rascunho ficam como estão/)).toBeTruthy();
    });

    it('busca falhou: avisa o erro', async () => {
        planejar.mockRejectedValue(new Error('rede'));
        await renomearESalvar(await abrirEdicao(), 'Cimento Forte Ltda');
        expect(await screen.findByText(/não foi possível verificar onde mais o nome aparece/i)).toBeTruthy();
    });

    it('segundo salvamento compara com o que acabou de ser gravado, não com o valor de quando a tela abriu', async () => {
        planejar.mockResolvedValue({ campos: { name: 'Cimento Forte Ltda' }, porDestino: {} });
        const campo = await abrirEdicao();
        await renomearESalvar(campo, 'Cimento Forte Ltda');
        await waitFor(() => expect(planejar).toHaveBeenCalledTimes(1));
        // Muda outro campo e salva de novo: o nome já gravado não muda → não procura cópias.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações' }).hasAttribute('disabled')).toBe(true));
        const salvoAntes = updateSupplier.mock.calls.length;
        fireEvent.change(campo, { target: { value: 'Cimento Forte Ltda ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await waitFor(() => expect(updateSupplier.mock.calls.length).toBe(salvoAntes + 1));
        expect(planejar).toHaveBeenCalledTimes(1);
    });
});
