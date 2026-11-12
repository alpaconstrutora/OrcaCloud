// @vitest-environment jsdom
/**
 * Minha Organização › Usuários › "Todos os usuários" › Editar (antes "Gerenciar").
 * Pedido de 12/11/2026: o botão levava a uma lista de membros da organização, sem a pessoa clicada,
 * sem dizer de qual organização era a lista e sem caminho de volta.
 *
 * O que este teste trava: o pedido abre a edição da pessoa certa UMA vez, o título diz a organização,
 * a seta de voltar só existe quando se chegou por "Todos os usuários".
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/organizationService', () => ({ organizationService: { updateMemberAccess: vi.fn(), urlAssinaturaMembro: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = 'org-1';
const membro = (id: string, name: string) => ({
    id, code: id, name, email: `${id}@exemplo.com`, role: 'member' as const, joinedAt: '2026-01-01', permissions: {},
});
const MEMBROS = [membro('m1', 'Maria'), membro('m2', 'Bruno')];

type Extra = Partial<React.ComponentProps<typeof OrganizationUsers>>;
const Tela = (extra: Extra) => (
    <ConfirmProvider>
        <OrganizationUsers
            organizationId={ORG}
            members={MEMBROS as never}
            onUpdateMembers={() => {}}
            customRoles={[]}
            onUpdateCustomRoles={() => {}}
            onUpdateAll={() => {}}
            {...extra}
        />
    </ConfirmProvider>
);

beforeEach(() => {
    localStorage.clear();
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: MEMBROS, customRoles: [] } as never],
        currentProfile: { group: 'DESENVOLVEDOR' } as never,
        session: { user: { email: 'admin@exemplo.com' } } as never,
    });
});

describe('Usuários da organização — chegada por "Todos os usuários"', () => {
    it('abre a edição da pessoa clicada, com os dados dela, e avisa uma vez só', () => {
        const onAbriuMembro = vi.fn();
        const { rerender } = render(<Tela abrirMembroId="m2" onAbriuMembro={onAbriuMembro} />);
        expect(screen.getByText('Editar Membro')).toBeTruthy();
        expect((screen.getByDisplayValue('Bruno') as HTMLInputElement).value).toBe('Bruno');
        expect(onAbriuMembro).toHaveBeenCalledTimes(1);

        // fecha e re-renderiza com o mesmo pedido: não reabre
        fireEvent.click(screen.getAllByRole('button').find(b => b.querySelector('svg.lucide-x'))!);
        expect(screen.queryByText('Editar Membro')).toBeNull();
        rerender(<Tela abrirMembroId="m2" onAbriuMembro={onAbriuMembro} />);
        expect(screen.queryByText('Editar Membro')).toBeNull();
        expect(onAbriuMembro).toHaveBeenCalledTimes(1);
    });

    it('pedido de uma pessoa que não está na lista não abre nada', () => {
        const onAbriuMembro = vi.fn();
        render(<Tela abrirMembroId="inexistente" onAbriuMembro={onAbriuMembro} />);
        expect(screen.queryByText('Editar Membro')).toBeNull();
        expect(onAbriuMembro).not.toHaveBeenCalled();
    });

    it('título com o nome da organização e seta que volta', () => {
        const onBack = vi.fn();
        render(<Tela orgName="Alpa Construtora" onBack={onBack} />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Usuários · Alpa Construtora');
        fireEvent.click(screen.getByTitle('Voltar para Todos os usuários'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('sem ter vindo de "Todos os usuários": título simples, sem seta, sem edição aberta', () => {
        render(<Tela />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Usuários');
        expect(screen.queryByTitle('Voltar para Todos os usuários')).toBeNull();
        expect(screen.queryByText('Editar Membro')).toBeNull();
    });
});
