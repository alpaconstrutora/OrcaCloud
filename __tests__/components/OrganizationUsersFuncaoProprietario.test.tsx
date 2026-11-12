// @vitest-environment jsdom
/**
 * Minha Organização › Usuários › Membros › coluna "Função / Cargo" e a função Proprietário.
 *
 * 1. O proprietário aparecia como "Admin": o select só tinha Admin/Membro/Visitante e o navegador cai na
 *    primeira opção quando o valor não existe (achado de 12/11/2026, pelo print da tela real).
 * 2. Decisões do usuário (12/11/2026): proprietário e admin podem promover a proprietário; o novo
 *    proprietário recebe TODAS as permissões; o último proprietário pode ser rebaixado.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateMemberAccess = vi.fn();
vi.mock('../../services/organizationService', () => ({
    organizationService: { updateMemberAccess: (...a: unknown[]) => updateMemberAccess(...a) },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = 'org-1';
type Papel = 'owner' | 'admin' | 'member';
const membro = (id: string, name: string, role: Papel) => ({
    id, code: id, name, email: `${id}@exemplo.com`, role, joinedAt: '2026-01-01', permissions: { canViewBudget: false }, customRoleId: 'cargo-x',
});
const MEMBROS = [membro('dono', 'Dono', 'owner'), membro('ana', 'Ana', 'admin'), membro('bia', 'Bia', 'member')];

/** `quem` = e-mail de quem está logado; `desenvolvedor` liga o acesso total do perfil. */
const montar = (quem: string, desenvolvedor = false, membros = MEMBROS) => {
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: membros, customRoles: [] } as never],
        currentProfile: { group: desenvolvedor ? 'DESENVOLVEDOR' : 'PERFIL_USUARIO' } as never,
        session: { user: { email: quem } } as never,
    });
    return render(
        <ConfirmProvider>
            <OrganizationUsers organizationId={ORG} members={membros as never} onUpdateMembers={() => {}} customRoles={[]} onUpdateCustomRoles={() => {}} onUpdateAll={() => {}} />
        </ConfirmProvider>,
    );
};

const selectDaLinha = (container: HTMLElement, nome: string) => {
    const linha = Array.from(container.querySelectorAll('tbody tr')).find(tr => tr.textContent?.includes(nome))!;
    return linha.querySelector('select') as HTMLSelectElement;
};
const opcoes = (s: HTMLSelectElement) => Array.from(s.options).map(o => o.value);

beforeEach(() => {
    localStorage.clear();
    updateMemberAccess.mockReset();
    updateMemberAccess.mockResolvedValue(undefined);
});

describe('coluna Função — exibição', () => {
    it('o proprietário aparece como Proprietário (e não como Admin)', () => {
        const { container } = montar('bia@exemplo.com');
        const dono = selectDaLinha(container, 'Dono');
        expect(dono.value).toBe('owner');
        expect(dono.options[dono.selectedIndex].text).toBe('Proprietário');
    });
});

describe('coluna Função — quem pode promover a proprietário', () => {
    it('proprietário, admin e desenvolvedor veem a opção em todas as linhas', () => {
        for (const [quem, dev] of [['dono@exemplo.com', false], ['ana@exemplo.com', false], ['qualquer@exemplo.com', true]] as const) {
            const { container, unmount } = montar(quem, dev);
            expect(opcoes(selectDaLinha(container, 'Bia'))).toEqual(['owner', 'admin', 'member', 'viewer']);
            unmount();
        }
    });

    it('membro comum não recebe a opção nas linhas dos outros (e o dono continua exibido como Proprietário)', () => {
        const { container } = montar('bia@exemplo.com');
        expect(opcoes(selectDaLinha(container, 'Ana'))).toEqual(['admin', 'member', 'viewer']);
        expect(opcoes(selectDaLinha(container, 'Bia'))).toEqual(['admin', 'member', 'viewer']);
        expect(opcoes(selectDaLinha(container, 'Dono'))).toContain('owner');
    });
});

describe('promover e rebaixar', () => {
    it('promover a proprietário pede confirmação e grava TODAS as permissões, sem cargo', async () => {
        const { container } = montar('ana@exemplo.com');
        fireEvent.change(selectDaLinha(container, 'Bia'), { target: { value: 'owner' } });

        expect(await screen.findByText('Tornar Bia proprietário?')).toBeTruthy();
        expect(updateMemberAccess).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Tornar proprietário'));

        await waitFor(() => expect(updateMemberAccess).toHaveBeenCalledTimes(1));
        const [id, patch] = updateMemberAccess.mock.calls[0] as [string, { role: string; customRoleId: null; permissions: Record<string, boolean> }];
        expect(id).toBe('bia');
        expect(patch.role).toBe('owner');
        expect(patch.customRoleId).toBeNull();
        const valores = Object.values(patch.permissions);
        expect(valores.length).toBeGreaterThan(20);
        expect(valores.every(v => v === true)).toBe(true);
    });

    it('cancelar a confirmação não grava nada e o select volta ao que era', async () => {
        const { container } = montar('ana@exemplo.com');
        fireEvent.change(selectDaLinha(container, 'Bia'), { target: { value: 'owner' } });
        await screen.findByText('Tornar Bia proprietário?');
        fireEvent.click(screen.getByText('Cancelar'));

        await waitFor(() => expect(screen.queryByText('Tornar Bia proprietário?')).toBeNull());
        expect(updateMemberAccess).not.toHaveBeenCalled();
        expect(selectDaLinha(container, 'Bia').value).toBe('member');
    });

    it('rebaixar o ÚNICO proprietário é permitido: avisa que é o último e grava', async () => {
        const { container } = montar('ana@exemplo.com');
        fireEvent.change(selectDaLinha(container, 'Dono'), { target: { value: 'admin' } });

        expect(await screen.findByText('Deixar de ser proprietário?')).toBeTruthy();
        expect(screen.getByText(/única pessoa com a função de proprietário/)).toBeTruthy();
        fireEvent.click(screen.getByText('Alterar função'));

        await waitFor(() => expect(updateMemberAccess).toHaveBeenCalledTimes(1));
        expect((updateMemberAccess.mock.calls[0] as [string, { role: string }])[1].role).toBe('admin');
    });

    it('com mais de um proprietário o aviso de "único" não aparece', async () => {
        const { container } = montar('ana@exemplo.com', false, [...MEMBROS, membro('dono2', 'Dono Dois', 'owner')]);
        fireEvent.change(selectDaLinha(container, 'Dono Dois'), { target: { value: 'member' } });
        await screen.findByText('Deixar de ser proprietário?');
        expect(screen.queryByText(/única pessoa/)).toBeNull();
    });

    it('troca que não envolve proprietário segue direta, sem confirmação (admin → membro)', async () => {
        const { container } = montar('dono@exemplo.com');
        fireEvent.change(selectDaLinha(container, 'Ana'), { target: { value: 'member' } });
        await waitFor(() => expect(updateMemberAccess).toHaveBeenCalledTimes(1));
        expect(screen.queryByText('Alterar função')).toBeNull();
    });
});
