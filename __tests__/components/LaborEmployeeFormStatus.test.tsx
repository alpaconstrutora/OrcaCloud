// @vitest-environment jsdom
/**
 * Caso real (22/10/2026): Iago Marques foi marcado "Inativo" e teve a admissão
 * trocada para 01/11/2026 no formulário — salvo duas vezes (17:10 e 17:11) —
 * e o cadastro ficou ATIVO, voltando à folha. O que cada "Salvar Alterações"
 * manda ao banco?
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

const labor = vi.hoisted(() => ({
    updateEmployee: vi.fn(async (_id: string, updates: Record<string, unknown>) => ({ id: 'iago', ...updates })),
    createEmployee: vi.fn(),
    employeePhotoUrl: vi.fn().mockReturnValue(null),
    removeEmployeePhoto: vi.fn(),
    uploadEmployeePhoto: vi.fn(),
}));
vi.mock('../../services/laborService', () => ({ laborService: labor }));
vi.mock('../../services/payrollService', () => ({
    payrollService: {
        listRubrics: vi.fn().mockResolvedValue([]),
        getEmployeeRecurringRubrics: vi.fn().mockResolvedValue([]),
        updateEmployeeRecurringRubrics: vi.fn().mockResolvedValue(undefined),
        listCostCenters: vi.fn().mockResolvedValue([]),
        listPlanoContas: vi.fn().mockResolvedValue([]),
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

const IAGO = {
    id: 'iago', org_id: 'org-garden', name: 'iago Marques', role: 'Engenheiro', status: 'ATIVO',
    contract_type: 'CLT', base_salary: 3000, hire_date: null,
} as unknown as Employee;

const statusSelect = () => screen.getAllByRole('combobox').find(s => Array.from((s as HTMLSelectElement).options).some(o => o.value === 'INATIVO')) as HTMLSelectElement;
const hireInput = () => document.querySelector('input[type="date"]') as HTMLInputElement;
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/ }));

describe('LaborEmployeeForm — status Inativo + admissão, dois salvamentos', () => {
    it('os dois PATCH levam INATIVO', async () => {
        render(<ConfirmProvider><LaborEmployeeForm employee={IAGO} orgId="org-garden" organizations={[{ id: 'org-garden', name: 'Garden' }]} onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);

        fireEvent.change(statusSelect(), { target: { value: 'INATIVO' } });
        fireEvent.change(hireInput(), { target: { value: '2026-11-01' } });
        salvar();
        await waitFor(() => expect(labor.updateEmployee).toHaveBeenCalledTimes(1));
        await screen.findByText('Alterações salvas.');

        fireEvent.change(hireInput(), { target: { value: '2026-11-02' } });
        await waitFor(() => expect(screen.getByRole('button', { name: /Salvar Alterações/ })).not.toBeDisabled());
        salvar();
        await waitFor(() => expect(labor.updateEmployee).toHaveBeenCalledTimes(2));

        const enviados = labor.updateEmployee.mock.calls.map(c => (c[1] as { status: string; hire_date: string }));
        expect(enviados.map(e => e.status)).toEqual(['INATIVO', 'INATIVO']);
        expect(enviados[0].hire_date).toBe('2026-11-01');
    });
});
