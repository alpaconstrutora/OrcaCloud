// @vitest-environment jsdom
/**
 * "Agrupar" em Minha Organização › Usuários › Membros (guia de UI §6.12).
 * Pedido de 12/11/2026: "implementar filtro agrupar com botão de classificação do filtro".
 *
 * Tela montada de verdade: o seletor agrupa, o cabeçalho do grupo traz só a contagem
 * (não há valor em dinheiro), o seletor Crescente/Decrescente inverte os grupos, recolher
 * esconde as linhas, e a escolha persiste.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/organizationService', () => ({ organizationService: { updateMemberAccess: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = 'org-1';
const membro = (id: string, name: string, role: 'admin' | 'member' | 'viewer', joinedAt: string, customRoleId?: string) => ({
    id, code: id, name, email: `${id}@exemplo.com`, role, joinedAt, customRoleId, permissions: {},
});
const MEMBROS = [
    membro('m1', 'Maria', 'member', '2026-03-05', 'cargo-eng'),
    membro('m2', 'Bruno', 'admin', '2026-01-20'),
    membro('m3', 'Carla', 'viewer', '2026-03-28'),
    membro('m4', 'Davi', 'admin', '2025-12-01'),
];
const CARGOS = [{ id: 'cargo-eng', name: 'Engenharia', permissions: {} }];

const Tela = () => (
    <ConfirmProvider>
        <OrganizationUsers
            organizationId={ORG}
            members={MEMBROS as never}
            onUpdateMembers={() => {}}
            customRoles={CARGOS as never}
            onUpdateCustomRoles={() => {}}
            onUpdateAll={() => {}}
        />
    </ConfirmProvider>
);

const agrupar = (campo: string) => fireEvent.change(screen.getByTitle('Agrupar os membros'), { target: { value: campo } });
const ordem = () => screen.getByLabelText('Ordem dos grupos') as HTMLSelectElement;
const cabecalhos = () => Array.from(document.querySelectorAll('td.p-0 span.font-semibold')).map(s => s.textContent);
const contagem = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!.querySelector('span.bg-slate-200')!.textContent;

beforeEach(() => {
    localStorage.clear();
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: MEMBROS, customRoles: CARGOS } as never],
        currentProfile: { group: 'DESENVOLVEDOR' } as never,
        session: { user: { email: 'admin@exemplo.com' } } as never,
    });
});

describe('Usuários › Membros › Agrupar', () => {
    it('sem agrupamento a tabela é a de sempre: nenhuma linha de grupo, ordem desligada com o motivo', () => {
        render(<Tela />);
        expect(cabecalhos()).toEqual([]);
        expect(screen.getAllByText(/@exemplo\.com/)).toHaveLength(4);
        expect(ordem().disabled).toBe(true);
        expect(ordem().title).toMatch(/Escolha um campo em "Agrupar"/);
    });

    it('agrupa por função na hierarquia, com a contagem (sem "R$")', () => {
        render(<Tela />);
        agrupar('funcao');
        expect(cabecalhos()).toEqual(['Admin', 'Membro', 'Visitante']);
        expect(contagem('Admin')).toBe('2');
        expect(contagem('Membro')).toBe('1');
        expect(document.body.textContent).not.toMatch(/R\$/);
    });

    it('o seletor de ordem inverte os grupos (Decrescente) e liga ao agrupar', () => {
        render(<Tela />);
        agrupar('funcao');
        expect(ordem().disabled).toBe(false);
        fireEvent.change(ordem(), { target: { value: 'desc' } });
        expect(cabecalhos()).toEqual(['Visitante', 'Membro', 'Admin']);
    });

    it('agrupa por cargo: "Sem cargo" por último nos dois sentidos', () => {
        render(<Tela />);
        agrupar('cargo');
        expect(cabecalhos()).toEqual(['Engenharia', 'Sem cargo']);
        fireEvent.change(ordem(), { target: { value: 'desc' } });
        expect(cabecalhos()).toEqual(['Engenharia', 'Sem cargo']);
    });

    it('agrupa por mês de entrada, cronológico', () => {
        render(<Tela />);
        agrupar('entrada');
        expect(cabecalhos()).toEqual(['Dezembro/2025', 'Janeiro/2026', 'Março/2026']);
    });

    it('clicar no cabeçalho recolhe o grupo; "recolher todos" recolhe e expande tudo', () => {
        render(<Tela />);
        agrupar('funcao');
        const admin = screen.getByText('Admin', { selector: 'span.font-semibold' });
        expect(screen.getByText('Bruno')).toBeTruthy();
        fireEvent.click(admin);
        expect(screen.queryByText('Bruno')).toBeNull();
        expect(screen.queryByText('Davi')).toBeNull();
        expect(screen.getByText('Maria')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Expandir todos os grupos'));
        expect(screen.getByText('Bruno')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Recolher todos os grupos'));
        expect(screen.queryByText('Maria')).toBeNull();
        expect(within(document.body).getAllByText(/Admin|Membro|Visitante/, { selector: 'span.font-semibold' })).toHaveLength(3);
    });

    it('a busca vale antes de agrupar: grupo sem membro não aparece', () => {
        render(<Tela />);
        agrupar('funcao');
        fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'carla' } });
        expect(cabecalhos()).toEqual(['Visitante']);
    });

    it('a escolha de campo e de sentido persiste ao remontar a tela', () => {
        const { unmount } = render(<Tela />);
        agrupar('funcao');
        fireEvent.change(ordem(), { target: { value: 'desc' } });
        unmount();
        render(<Tela />);
        expect(cabecalhos()).toEqual(['Visitante', 'Membro', 'Admin']);
        expect(ordem().value).toBe('desc');
    });
});
