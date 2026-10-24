// @vitest-environment jsdom
/**
 * Colaborador › Folha de Pagamento. 22/10/2026: em vez de listar todas as
 * rubricas com um switch, a aba mostra só as incluídas e o "Adicionar" abre um
 * drawer com as que faltam — busca + checkbox, várias de uma vez.
 * 23/10/2026: o drawer escondia as não-"Automáticas" (11 de 33). Agora lista
 * todas; trava só as que a folha já calcula, e cada vínculo leva o valor do
 * colaborador (R$ ou % do salário). Quem grava continua sendo o "Salvar".
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

const rubrica = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
    code, name, type: 'provento', incidence_inss: true, incidence_fgts: true, incidence_irrf: true,
    is_automatic: true, is_clt_mandatory: false, calculation_type: 'fixed', calculation_config: { amount: 150 }, category: 'benefit', active: true, ...extra,
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
    payroll.updateEmployeeRecurringRubrics.mockClear();
    payroll.listRubrics.mockResolvedValue([
        rubrica('VT_EXTRA', 'Vale transporte extra'),
        rubrica('AUX_CRECHE', 'Auxílio creche'),
        rubrica('GRATIFICACAO', 'Gratificação', { is_automatic: false, calculation_type: 'manual', calculation_config: null, category: null }),
        rubrica('INSS', 'Desconto INSS', { type: 'desconto', is_clt_mandatory: true, calculation_type: 'manual', category: 'tax' }),
        rubrica('BONUS_ANTIGO', 'Bônus antigo', { active: false }),
    ]);
    payroll.getEmployeeRecurringRubrics.mockResolvedValue([
        { code: 'VT_EXTRA', valor_tipo: null, valor: null },
        { code: 'BONUS_ANTIGO', valor_tipo: null, valor: null },
    ]);
    render(<ConfirmProvider><LaborEmployeeForm employee={ANA} orgId="org-a" organizations={[{ id: 'org-a', name: 'A' }]} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Folha de Pagamento' }));
    await screen.findByText('Vale transporte extra');
};

const drawer = () => screen.getByText('Adicionar rubricas recorrentes').closest('[role="dialog"]') as HTMLElement;
const linha = (onde: HTMLElement, nome: string) => within(onde).getByText(nome).closest('tr') as HTMLElement;
const marcar = (onde: HTMLElement, nome: string) => fireEvent.click(within(linha(onde, nome)).getByRole('checkbox'));
const adicionar = async (...nomes: string[]) => {
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    const d = await waitFor(drawer);
    nomes.forEach(n => marcar(d, n));
    fireEvent.click(within(d).getByRole('button', { name: /^Adicionar \d+ rubricas?$/ }));
};
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/ }));

describe('LaborEmployeeForm › Folha de Pagamento — Adicionar rubricas', () => {
    it('a aba mostra só as incluídas, inclusive a inativa, com o cálculo da rubrica no campo vazio', async () => {
        await abrirAba();
        expect(screen.getByText('2 rubricas incluídas')).toBeTruthy();
        expect(screen.getByText('(inativa)')).toBeTruthy();
        expect(screen.queryByText('Auxílio creche')).toBeNull();
        expect(screen.getByLabelText('Valor de Vale transporte extra').getAttribute('placeholder')).toBe('R$ 150,00');
    });

    it('o drawer lista também as não-automáticas, trava o INSS com o motivo e adiciona as marcadas', async () => {
        await abrirAba();
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
        const d = await waitFor(drawer);

        expect(within(d).getByText('Gratificação')).toBeTruthy();
        expect(within(d).getByText('Auxílio creche')).toBeTruthy();
        expect(within(d).queryByText('Vale transporte extra')).toBeNull();   // já incluída
        expect(within(d).queryByText('Bônus antigo')).toBeNull();            // inativa
        const inss = within(d).getByText(/Calculada pela folha/).closest('tr') as HTMLElement;
        expect(within(inss).queryByRole('checkbox')).toBeNull();

        expect((within(d).getByRole('button', { name: 'Adicionar rubricas' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(within(d).getByPlaceholderText(/Buscar rubrica/), { target: { value: 'grati' } });
        await waitFor(() => expect(within(d).queryByText('Auxílio creche')).toBeNull());
        marcar(d, 'Gratificação');
        fireEvent.change(within(d).getByPlaceholderText(/Buscar rubrica/), { target: { value: '' } });
        await within(d).findByText('Auxílio creche');
        marcar(d, 'Auxílio creche');
        fireEvent.click(within(d).getByRole('button', { name: 'Adicionar 2 rubricas' }));
        await screen.findByText('4 rubricas incluídas');
    });

    // 23/10/2026 (usuário): "rubrica com R$ pode ser variável, então permita que
    // deixe sem ser preenchido (em aberto)". Antes, o Salvar recusava.
    it('rubrica manual sem valor fica em aberto e o Salvar grava sem valor', async () => {
        await abrirAba();
        await adicionar('Gratificação');
        await screen.findByText('3 rubricas incluídas');
        expect(screen.getByLabelText('Valor de Gratificação').getAttribute('placeholder')).toBe('Em aberto');

        salvar();
        await waitFor(() => expect(payroll.updateEmployeeRecurringRubrics).toHaveBeenCalled());
        expect(payroll.updateEmployeeRecurringRubrics.mock.calls.at(-1)?.[1]).toContainEqual(
            { code: 'GRATIFICACAO', valor_tipo: 'fixo', valor: null },
        );
    });

    it('R$ 500 na Gratificação, % na outra, remover uma: o Salvar manda a lista com os valores', async () => {
        await abrirAba();
        await adicionar('Gratificação', 'Auxílio creche');
        await screen.findByText('4 rubricas incluídas');

        fireEvent.change(screen.getByLabelText('Valor de Gratificação'), { target: { value: '50000' } });
        const creche = linha(document.body, 'Auxílio creche');
        fireEvent.change(within(creche).getByRole('combobox'), { target: { value: 'percentual' } });
        fireEvent.change(screen.getByLabelText('Valor de Auxílio creche'), { target: { value: '1000' } });

        fireEvent.click(within(linha(document.body, 'Vale transporte extra')).getByTitle('Remover da folha deste colaborador'));
        await screen.findByText('3 rubricas incluídas');

        salvar();
        await waitFor(() => expect(payroll.updateEmployeeRecurringRubrics).toHaveBeenCalled());
        expect(payroll.updateEmployeeRecurringRubrics.mock.calls.at(-1)?.[1]).toEqual([
            { code: 'BONUS_ANTIGO', valor_tipo: null, valor: null },
            // na ordem da lista do drawer, não na ordem dos cliques
            { code: 'AUX_CRECHE', valor_tipo: 'percentual', valor: 10 },
            { code: 'GRATIFICACAO', valor_tipo: 'fixo', valor: 500 },
        ]);
    });
});
