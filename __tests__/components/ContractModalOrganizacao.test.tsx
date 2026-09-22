// @vitest-environment jsdom
/**
 * Contrato novo com o topo em "Todas as Organizações" — o seletor interno
 * ("Organização *") oferecia TODAS as organizações de `useStore()`, inclusive
 * as que não são do usuário: a RLS de `organizations` é mais frouxa que a das
 * tabelas de dados (22/09/2026: 4 no seletor, membro de 1). Escolher uma delas
 * devolvia `42501 new row violates row-level security policy` no INSERT —
 * mesmo defeito do cadastro de cliente, corrigido no mesmo dia.
 *
 * O que este teste trava:
 *  1. o seletor interno lista só as organizações graváveis;
 *  2. com UMA gravável o seletor nem aparece (REGRA #5: só se pergunta quando
 *     o alvo é ambíguo) e o contrato nasce naquela organização.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// `vi.mock` é içado para o topo do arquivo: nada de variável de módulo dentro
// da fábrica — daí cada uma declarar seu próprio `() => Promise.resolve([])`.
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: () => Promise.resolve([]) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: () => Promise.resolve([]),
        listPlanoContas: () => Promise.resolve([]),
        listChartOfAccounts: () => Promise.resolve([]),
        listPaymentAccounts: () => Promise.resolve([]),
    },
}));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: () => Promise.resolve([]) } }));
vi.mock('../../services/storageService', () => ({ storageService: { upload: vi.fn() } }));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: () => Promise.resolve([]) } }));
vi.mock('../../services/contractTypeService', () => ({ contractTypeService: { listTypes: () => Promise.resolve([]) } }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { list: () => Promise.resolve([]) } }));
vi.mock('../../services/documentNumbering', () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue('001'),
    MissingCodeError: class extends Error {},
    DocType: {},
}));
vi.mock('../../services/contractNumberRegenService', () => ({
    getNumberLockReason: () => null,
    regenerateContractNumber: vi.fn(),
}));
vi.mock('../../lib/supabase', () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain; chain.order = () => chain;
    chain.limit = () => chain; chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
    return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: vi.fn() } } };
});

import { ContractModal } from '../../components/ContractModal';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const EMAIL = 'dev@exemplo.com';
const org = (id: string, name: string, membros: string[]) => ({
    id,
    name,
    members: membros.map((email, i) => ({ id: `${id}-m${i}`, email, name: email, role: 'member' })),
} as never);

const MINHA = org('org-1', 'Alpa Construtora', [EMAIL]);
const OUTRA_MINHA = org('org-4', 'Segunda Minha', [EMAIL]);
const ALHEIA = org('org-2', 'ALPA Empreendimentos', ['outro@exemplo.com']);
const SPE = org('org-3', 'Garden Cambuhy SPE', ['outro@exemplo.com']);

const montar = (organizations: unknown[]) => {
    useStore.setState({
        organizations: organizations as never,
        projects: [] as never,
        activeOrganizationId: null,
        activeEmpresaId: null,
        currentProfile: { ...useStore.getState().currentProfile, email: EMAIL },
    } as never);
    render(
        <ConfirmProvider>
            <ContractModal
                isOpen
                onClose={() => {}}
                onSubmit={async () => {}}
                projectId=""
                organizationId={undefined}
                domain="SUPRIMENTOS"
            />
        </ConfirmProvider>,
    );
};

/** O seletor interno de organização, quando ele existe. */
const seletorOrg = (): HTMLSelectElement | null => {
    const rotulo = screen.queryByText('Organização *');
    return (rotulo?.parentElement?.querySelector('select') as HTMLSelectElement) ?? null;
};

describe('ContractModal — organização do contrato novo', () => {
    beforeEach(() => vi.clearAllMocks());

    it('N graváveis: o seletor lista só as do usuário', () => {
        montar([MINHA, OUTRA_MINHA, ALHEIA, SPE]);

        const select = seletorOrg();
        expect(select).not.toBeNull();
        const rotulos = Array.from(select!.options).map(o => o.textContent);
        expect(rotulos).toEqual(['Selecione a organização deste contrato', 'Alpa Construtora', 'Segunda Minha']);
    });

    it('uma única gravável: não pergunta (REGRA #5)', () => {
        montar([MINHA, ALHEIA, SPE]);
        expect(seletorOrg()).toBeNull();
    });
});
