// @vitest-environment jsdom
/**
 * Minha Organização › Usuários › Membros: o proprietário aparecia como "Admin" na coluna
 * "Função / Cargo", porque o select só tinha Admin/Membro/Visitante e o navegador cai na
 * primeira opção quando o valor não existe (achado de 12/11/2026, pelo print da tela real).
 *
 * "Proprietário" existe no select só de quem JÁ é proprietário — não é oferecido a mais ninguém,
 * para o select não virar caminho de promoção a dono.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/organizationService', () => ({ organizationService: { updateMemberAccess: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';

const ORG = 'org-1';
const membro = (id: string, name: string, role: 'owner' | 'admin' | 'member') => ({
    id, code: id, name, email: `${id}@exemplo.com`, role, joinedAt: '2026-01-01', permissions: {},
});
const MEMBROS = [membro('m1', 'Dono', 'owner'), membro('m2', 'Ana', 'admin'), membro('m3', 'Bia', 'member')];

beforeEach(() => {
    localStorage.clear();
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: MEMBROS, customRoles: [] } as never],
        currentProfile: { group: 'DESENVOLVEDOR' } as never,
        session: { user: { email: 'admin@exemplo.com' } } as never,
    });
});

const selectDaLinha = (container: HTMLElement, nome: string) => {
    const linha = Array.from(container.querySelectorAll('tbody tr')).find(tr => tr.textContent?.includes(nome))!;
    return linha.querySelector('select') as HTMLSelectElement;
};
const opcoes = (s: HTMLSelectElement) => Array.from(s.options).map(o => o.value);

describe('Usuários › Membros › coluna Função', () => {
    it('o proprietário aparece como Proprietário (e não como Admin)', () => {
        const { container } = render(
            <ConfirmProvider>
                <OrganizationUsers organizationId={ORG} members={MEMBROS as never} onUpdateMembers={() => {}} customRoles={[]} onUpdateCustomRoles={() => {}} onUpdateAll={() => {}} />
            </ConfirmProvider>,
        );
        const dono = selectDaLinha(container, 'Dono');
        expect(dono.value).toBe('owner');
        expect(dono.options[dono.selectedIndex].text).toBe('Proprietário');
    });

    it('a opção Proprietário não é oferecida a quem não é proprietário', () => {
        const { container } = render(
            <ConfirmProvider>
                <OrganizationUsers organizationId={ORG} members={MEMBROS as never} onUpdateMembers={() => {}} customRoles={[]} onUpdateCustomRoles={() => {}} onUpdateAll={() => {}} />
            </ConfirmProvider>,
        );
        expect(opcoes(selectDaLinha(container, 'Ana'))).toEqual(['admin', 'member', 'viewer']);
        expect(opcoes(selectDaLinha(container, 'Bia'))).toEqual(['admin', 'member', 'viewer']);
        expect(selectDaLinha(container, 'Ana').value).toBe('admin');
    });
});
