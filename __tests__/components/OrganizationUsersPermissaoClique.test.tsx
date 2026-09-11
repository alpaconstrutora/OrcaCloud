// @vitest-environment jsdom
/**
 * Minha Organização › Usuários › Permissões detalhadas — pedido de 2026-09-11:
 * "ao clicar no checkbox o app está demorando muito".
 *
 * Causa: cada clique passava por onUpdateMembers → handleUpsertOrganization →
 * updateOrganization (UPDATE em organizations + um upsert em série por membro e
 * por cargo) → fetchOrganizations (recarrega TODAS as organizações). O checkbox
 * só mudava de estado no fim dessa cadeia.
 *
 * O que este teste trava:
 *  1. um clique = UMA chamada ao serviço, só para o membro clicado;
 *  2. onUpdateMembers NÃO é chamado (nada reescreve a organização inteira);
 *  3. o checkbox muda no store no mesmo instante, antes de a rede responder;
 *  4. se a gravação falhar, o store volta ao que era.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateMemberAccess = vi.fn();

vi.mock('../../services/organizationService', () => ({
    organizationService: {
        updateMemberAccess: (...args: unknown[]) => updateMemberAccess(...args),
    },
}));

vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = 'org-1';
const membro = {
    id: 'm1',
    code: '001',
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    role: 'member' as const,
    joinedAt: '2026-01-01',
    customRoleId: 'cargo-modelo',
    permissions: { canViewCommandCenter: true, canViewDocs: false },
};

// Mesma cadeia da tela real: AppRouter lê `organizations` do store e
// OrganizationList repassa `currentOrg.members` — o componente nunca guarda
// cópia própria dos membros.
const Tela = ({ onUpdateMembers }: { onUpdateMembers: (m: unknown) => void }) => {
    const org = useStore(s => s.organizations.find(o => o.id === ORG));
    return (
        <ConfirmProvider>
            <OrganizationUsers
                organizationId={ORG}
                members={org?.members || []}
                onUpdateMembers={onUpdateMembers as never}
                customRoles={[]}
                onUpdateCustomRoles={() => {}}
                onUpdateAll={() => {}}
            />
        </ConfirmProvider>
    );
};

const abrirPermissoes = async () => {
    fireEvent.click(await screen.findByTitle('Permissões'));
    return screen.findByTitle('Permite ver o módulo Gestão de Documentos.') as Promise<HTMLInputElement>;
};

beforeEach(() => {
    localStorage.clear();
    updateMemberAccess.mockReset();
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: [{ ...membro }], customRoles: [] } as never],
        currentProfile: { group: 'DESENVOLVEDOR' } as never,
        session: { user: { email: 'admin@exemplo.com' } } as never,
    });
});

describe('Permissões detalhadas — clique no checkbox', () => {
    it('grava só o membro clicado, uma vez, sem reescrever a organização', async () => {
        let liberar!: () => void;
        updateMemberAccess.mockImplementation(() => new Promise<void>(r => { liberar = r; }));
        const onUpdateMembers = vi.fn();
        render(<Tela onUpdateMembers={onUpdateMembers} />);

        const cb = await abrirPermissoes();
        expect(cb.checked).toBe(false);

        fireEvent.click(cb);

        // Estado muda ANTES de a rede responder (a promessa ainda está pendente).
        await waitFor(() => expect((screen.getByTitle('Permite ver o módulo Gestão de Documentos.') as HTMLInputElement).checked).toBe(true));
        expect(updateMemberAccess).toHaveBeenCalledTimes(1);
        expect(updateMemberAccess).toHaveBeenCalledWith('m1', {
            customRoleId: null,
            permissions: { canViewCommandCenter: true, canViewDocs: true },
        });
        expect(onUpdateMembers).not.toHaveBeenCalled();

        await act(async () => { liberar(); });
        const salvo = useStore.getState().organizations[0].members![0];
        expect(salvo.permissions?.canViewDocs).toBe(true);
        expect(salvo.customRoleId).toBeUndefined();
    });

    it('"Marcar tudo" de um grupo também é uma única gravação', async () => {
        updateMemberAccess.mockResolvedValue(undefined);
        render(<Tela onUpdateMembers={vi.fn()} />);
        await abrirPermissoes();

        fireEvent.click(screen.getAllByText('Marcar tudo')[0]);

        await waitFor(() => expect(updateMemberAccess).toHaveBeenCalledTimes(1));
        const [id, patch] = updateMemberAccess.mock.calls[0] as [string, { permissions: Record<string, boolean> }];
        expect(id).toBe('m1');
        expect(Object.values(patch.permissions).some(v => v === true)).toBe(true);
    });

    it('se a gravação falhar, o checkbox volta ao que era', async () => {
        updateMemberAccess.mockRejectedValue(new Error('RLS'));
        render(<Tela onUpdateMembers={vi.fn()} />);
        const cb = await abrirPermissoes();

        fireEvent.click(cb);

        await waitFor(() => expect((screen.getByTitle('Permite ver o módulo Gestão de Documentos.') as HTMLInputElement).checked).toBe(false));
        expect(useStore.getState().organizations[0].members![0].customRoleId).toBe('cargo-modelo');
        expect(await screen.findByText(/Não foi possível salvar a permissão/)).toBeTruthy();
    });
});
