// @vitest-environment jsdom
/**
 * Minha organização › Usuários: o `onUpdateMembers` que o OrganizationList entrega ao
 * OrganizationUsers devolve a PROMESSA do `onSave` (handleUpsertOrganization).
 *
 * O convite a partir de um colaborador do RH espera essa promessa antes de ler o login do membro:
 * quando o e-mail já tinha conta, quem cria a linha do membro é esta gravação. Se o corpo virar
 * `{ … }` (sem return), o convite lê antes de a linha existir e diz "conta não existe" — sem
 * nenhum outro teste quebrar. Pedido de 16/11 (2º), item 8 de
 * docs/planos/2026-11-16-usuarios-convidar-colaborador.md.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let propsDoUsuarios: { onUpdateMembers: (m: unknown[]) => unknown } | null = null;
vi.mock('../../components/OrganizationUsers', () => ({
    default: (p: { onUpdateMembers: (m: unknown[]) => unknown }) => { propsDoUsuarios = p; return null; },
}));
const { Nada } = vi.hoisted(() => ({ Nada: () => null }));
vi.mock('../../components/OrganizationDetail', () => ({ default: Nada }));
vi.mock('../../components/ClientList', () => ({ default: Nada }));
vi.mock('../../components/InvestorList', () => ({ default: Nada }));
vi.mock('../../components/SupplierList', () => ({ SupplierList: Nada }));
vi.mock('../../components/FinancialRegistryManager', () => ({ default: Nada }));
vi.mock('../../components/financeiro/ContaAsaasSecao', () => ({ default: Nada }));
vi.mock('../../components/CostCenterModule', () => ({ default: Nada }));
vi.mock('../../components/PlanoDeContasModule', () => ({ default: Nada }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: { listPaymentAccounts: vi.fn(async () => []), listChartOfAccounts: vi.fn(async () => []) },
}));
vi.mock('../../services/organizationService', () => ({ organizationService: {} }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() } }));

import OrganizationList from '../../components/OrganizationList';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = { id: 'org-1', name: 'Alpa', members: [], customRoles: [] };

beforeEach(() => {
    propsDoUsuarios = null;
    localStorage.clear();
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, companies: [] } as never);
});

describe('OrganizationList › Usuários — onUpdateMembers', () => {
    it('devolve a promessa do onSave, com os membros novos na organização', () => {
        const promessa = Promise.resolve();
        const onSave = vi.fn(() => promessa);
        render(
            <ConfirmProvider>
                <OrganizationList
                    organizations={[ORG] as never}
                    onCreate={() => {}} onEdit={() => {}} onSave={onSave} onDelete={() => {}} onSelect={() => {}}
                    activeTab="users" onTabChange={() => {}} projects={[]}
                    onClientsChange={() => {}} onLoadProject={() => {}} onEditProject={() => {}}
                    onNewProject={() => {}} onDuplicateProject={() => {}} onImportProject={() => {}} onExportProject={() => {}}
                />
            </ConfirmProvider>,
        );
        expect(propsDoUsuarios).not.toBeNull();
        const novos = [{ id: 'm1', email: 'a@x.com' }];
        expect(propsDoUsuarios!.onUpdateMembers(novos)).toBe(promessa);
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'org-1', members: novos }));
    });
});
