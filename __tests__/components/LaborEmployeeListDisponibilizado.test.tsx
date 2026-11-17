// @vitest-environment jsdom
/**
 * Colaborador DISPONIBILIZADO por outra organização (employee_org_shares) aparece na lista de
 * quem o recebeu, mas só membro da organização DONA grava nele: a RLS de `employees` (policies
 * employees_update/_delete, migration aplicar_20271117910000) recusa o resto. Na linha dele,
 * Editar, Disponibilizar, Inativar e Excluir vêm desligados e dizem o motivo — antes Excluir
 * apagava 0 linhas e a tela anunciava "Colaborador excluído.".
 * Plano: docs/planos/2026-11-17-rh-rpcs-autorizacao.md.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import type { Employee } from '../../services/laborService';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: null }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    // membro só da Alpa
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
}));
vi.mock('../../services/laborService', () => ({ laborService: { updateEmployee: vi.fn(), removeEmployee: vi.fn() } }));

import LaborEmployeeList from '../../components/LaborEmployeeList';

const emp = (id: string, name: string, org_id: string): Employee => ({
    id, name, role: 'Pedreiro', cpf: '', org_id, contract_type: 'CLT', status: 'ATIVO', base_salary: 1000, daily_cost: 0, hourly_cost: 0,
} as unknown as Employee);

const tela = () => render(
    <LaborEmployeeList
        employees={[emp('e1', 'Ana', 'org1'), emp('e2', 'Bia', 'org2')]}
        projects={[]}
        organizations={[{ id: 'org1', name: 'Alpa' }, { id: 'org2', name: 'Garden' }]}
        onEdit={vi.fn()} onNew={vi.fn()} onRefresh={vi.fn()} isAllOrgsMode
    />,
);

const linha = (nome: string) => within(screen.getByText(nome).closest('tr')!);
const botoes = (nome: string) => ['Editar', 'Disponibilizar para outras organizações', 'Inativar', 'Excluir permanentemente']
    .map(t => linha(nome).getByTitle(t, { selector: 'button' }) as HTMLButtonElement);

describe('Colaboradores — colaborador disponibilizado por outra organização', () => {
    it('na linha dele, os quatro botões que gravam vêm desligados', () => {
        tela();
        expect(botoes('Bia').map(b => b.disabled)).toEqual([true, true, true, true]);
    });

    it('o motivo aparece no hover (no invólucro, porque o botão desligado não recebe o mouse)', () => {
        tela();
        for (const b of botoes('Bia')) {
            expect(b.parentElement!.getAttribute('title')).toBe(
                'Disponibilizado por Garden: só quem é membro de Garden altera este colaborador');
        }
    });

    it('colaborador da organização do usuário segue com os botões ligados e sem motivo', () => {
        tela();
        const ana = botoes('Ana');
        expect(ana.map(b => b.disabled)).toEqual([false, false, false, false]);
        expect(ana.map(b => b.parentElement!.getAttribute('title'))).toEqual([null, null, null, null]);
    });
});
