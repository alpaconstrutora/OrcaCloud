// @vitest-environment jsdom
/**
 * Colaborador › Folha de Pagamento (22/10/2026): em vez de listar todas as
 * rubricas com um switch, a aba mostra só as incluídas e o "Adicionar" abre um
 * drawer com as que faltam — busca + checkbox, várias de uma vez. Quem grava
 * continua sendo o "Salvar" (`updateEmployeeRecurringRubrics`).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

const rubrica = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
    code, name, type: 'provento', incidence_inss: true, incidence_fgts: true, incidence_irrf: true,
    is_automatic: true, is_clt_mandatory: false, calculation_type: 'fixed', category: 'benefit', active: true, ...extra,
});

const payroll = vi.hoisted(() => ({
    listRubrics: vi.fn(),
    getEmployeeRecurringRubrics: vi.fn(),
    updateEmployeeRecurringRubrics: vi.fn().mockResolvedValue(undefined),
    listCostCenters: vi.fn().mockResolvedValue([]),
    listPlanoContas: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/payrollService', () => ({ payrollService: payroll }));
vi.mock('../../services/laborService', () => ({
    laborService: {
        updateEmployee: vi.fn(async (_id: string, updates: Record<string, unknown>) => ({ id: 'ana', org_id: 'org-a', ...updates })),
        createEmployee: vi.fn(),
        employeePhotoUrl: vi.fn().mockReturnValue(null),
        removeEmployeePhoto: vi.fn(),
        uploadEmployeePhoto: vi.fn(),
    },
}));
vi.mock('../../services/employeeBankAccountService', () => ({
    employeeBankAccountService: { list: vi.fn().mockResolvedValue([]), saveAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/orgGovernanceService', () => ({ orgGovernanceService: { listRoles: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../lib/supabase', () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of ['select', 'eq', 'not', 'in', 'order', 'limit', 'is', 'or', 'ilike', 'maybeSingle', 'single']) builder[m] = chain;
    builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return { supabase: { from: vi.fn(() => builder), rpc: vi.fn().mockResolvedValue({ data: null, error: null }), storage: { from: vi.fn() } } };
});

import LaborEmployeeForm from '../../components/LaborEmployeeForm';
import type { Employee } from '../../services/laborService';
import { ConfirmProvider } from '../../components/ui/confirm';

const ANA = { id: 'ana', org_id: 'org-a', name: 'Ana', role: 'Engenheiro', status: 'ATIVO', contract_type: 'CLT', base_salary: 3000 } as unknown as Employee;

const abrirAba = async () => {
    payroll.listRubrics.mockResolvedValue([
        rubrica('VT_EXTRA', 'Vale transporte extra'),
        rubrica('AUX_CRECHE', 'Auxílio creche'),
        rubrica('AJUDA_CUSTO', 'Ajuda de custo'),
        rubrica('INSS', 'INSS', { is_clt_mandatory: true }),
        rubrica('BONUS_ANTIGO', 'Bônus antigo', { active: false }),
    ]);
    payroll.getEmployeeRecurringRubrics.mockResolvedValue(['VT_EXTRA', 'BONUS_ANTIGO']);
    render(<ConfirmProvider><LaborEmployeeForm employee={ANA} orgId="org-a" organizations={[{ id: 'org-a', name: 'A' }]} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Folha de Pagamento' }));
    await screen.findByText('Vale transporte extra');
};

const drawer = () => screen.getByText('Adicionar rubricas recorrentes').closest('[role="dialog"]') as HTMLElement;
const marcar = (onde: HTMLElement, nome: string) =>
    fireEvent.click(within(within(onde).getByText(nome).closest('tr') as HTMLElement).getByRole('checkbox'));

describe('LaborEmployeeForm › Folha de Pagamento — Adicionar rubricas', () => {
    it('a aba mostra só as incluídas, inclusive a inativa, e nenhuma não incluída', async () => {
        await abrirAba();
        expect(screen.getByText('2 rubricas incluídas')).toBeTruthy();
        expect(screen.getByText('Bônus antigo')).toBeTruthy();
        expect(screen.getByText('(inativa)')).toBeTruthy();
        expect(screen.queryByText('Auxílio creche')).toBeNull();
        expect(screen.queryByText('Ajuda de custo')).toBeNull();
    });

    it('o seletor lista só as automáticas que faltam, busca filtra, e Adicionar inclui as marcadas', async () => {
        await abrirAba();
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
        const d = await waitFor(drawer);

        // Já incluída, Padrão CLT e inativa não aparecem para adicionar.
        expect(within(d).getByText('Auxílio creche')).toBeTruthy();
        expect(within(d).getByText('Ajuda de custo')).toBeTruthy();
        expect(within(d).queryByText('Vale transporte extra')).toBeNull();
        expect(within(d).queryByText('INSS', { selector: 'td span' })).toBeNull();
        expect(within(d).queryByText('Bônus antigo')).toBeNull();

        const confirmar = within(d).getByRole('button', { name: 'Adicionar rubricas' }) as HTMLButtonElement;
        expect(confirmar.disabled).toBe(true);

        fireEvent.change(within(d).getByPlaceholderText(/Buscar rubrica/), { target: { value: 'creche' } });
        await waitFor(() => expect(within(d).queryByText('Ajuda de custo')).toBeNull());
        marcar(d, 'Auxílio creche');
        fireEvent.change(within(d).getByPlaceholderText(/Buscar rubrica/), { target: { value: '' } });
        await within(d).findByText('Ajuda de custo');
        marcar(d, 'Ajuda de custo');

        fireEvent.click(within(d).getByRole('button', { name: 'Adicionar 2 rubricas' }));
        await waitFor(() => expect(screen.getByText('4 rubricas incluídas')).toBeTruthy());
    });

    it('remover tira da tabela, e o Salvar grava a lista final', async () => {
        await abrirAba();
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
        const d = await waitFor(drawer);
        marcar(d, 'Auxílio creche');
        fireEvent.click(within(d).getByRole('button', { name: 'Adicionar 1 rubrica' }));
        await screen.findByText('3 rubricas incluídas');

        const linhaVT = screen.getAllByText('Vale transporte extra').map(el => el.closest('tr')).find(Boolean) as HTMLElement;
        fireEvent.click(within(linhaVT).getByTitle('Remover da folha deste colaborador'));
        await screen.findByText('2 rubricas incluídas');

        fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/ }));
        await waitFor(() => expect(payroll.updateEmployeeRecurringRubrics).toHaveBeenCalled());
        expect(payroll.updateEmployeeRecurringRubrics.mock.calls.at(-1)?.[1]).toEqual(['BONUS_ANTIGO', 'AUX_CRECHE']);
    });
});
