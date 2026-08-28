// @vitest-environment jsdom
/**
 * Testes da aba Alocações (RH › Gestão de Folha de Pagamento), pedido de
 * 2026-08-28:
 *
 *  1. centro de custo vinculado a uma obra aloca o colaborador sozinho, e só
 *     para quem está sem alocação nenhuma no mês;
 *  2. o cargo saiu de baixo do nome e virou coluna própria.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const listAllocationsForEmployees = vi.fn();
const insertAutoAllocations = vi.fn();

vi.mock('../../services/payrollService', () => ({
    payrollService: {
        listWorksites: vi.fn(async () => [
            { id: 'obraA', name: 'Residencial Alfa' },
            { id: 'obraB', name: 'Residencial Beta' },
        ]),
        listCostCenters: vi.fn(async () => [
            { id: 'cc1', name: 'CC Alfa', code: '001', project_id: 'obraA' },
            { id: 'cc2', name: 'CC Administrativo', code: '002', project_id: null },
        ]),
        listPlanoContas: vi.fn(async () => []),
        listAllocationsForEmployees: (...args: unknown[]) => listAllocationsForEmployees(...args),
        listCostSplitsForEmployees: vi.fn(async () => ({})),
        listClosedResultsForEmployees: vi.fn(async () => ({})),
        ultimaCompetenciaComRateio: vi.fn(async () => null),
        insertAutoAllocations: (...args: unknown[]) => insertAutoAllocations(...args),
    },
}));

// O painel só abre no clique da linha; o modal de holerite fala com o Supabase.
vi.mock('../../components/PaystubModal', () => ({ default: () => null }));

import LaborAllocations from '../../components/LaborAllocations';

const colaborador = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    org_id: 'org1',
    name: 'Maria Silva',
    role: 'Mestre de Obras',
    contract_type: 'CLT',
    daily_cost: 0,
    hourly_cost: 0,
    base_salary: 3000,
    status: 'ATIVO',
    cost_center_id: 'cc1',
    ...over,
}) as never;

const renderTela = (employees: never[]) =>
    render(<LaborAllocations orgId="org1" employees={employees} onRefresh={() => {}} />);

beforeEach(() => {
    localStorage.clear();
    listAllocationsForEmployees.mockReset();
    insertAutoAllocations.mockReset();
    insertAutoAllocations.mockResolvedValue(undefined);
});

describe('LaborAllocations — alocação automática pela obra do centro de custo', () => {
    it('aloca 100% na obra do centro de custo quem está sem alocação no mês', async () => {
        // 1ª chamada: carregamento do mês (ninguém alocado). 2ª: releitura de quem foi tocado.
        listAllocationsForEmployees
            .mockResolvedValueOnce({})
            .mockResolvedValue({ e1: [{ employee_id: 'e1', project_id: 'obraA', allocation_percent: 100 }] });

        renderTela([colaborador()]);

        await waitFor(() => expect(insertAutoAllocations).toHaveBeenCalledTimes(1));
        const [periodo, itens] = insertAutoAllocations.mock.calls[0];
        expect(periodo).toMatch(/^\d{4}-\d{2}$/);
        expect(itens).toEqual([{ employee_id: 'e1', project_id: 'obraA', allocation_percent: 100 }]);

        // A linha passa a mostrar a alocação recém-gravada, sem recarregar a tela.
        await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());
    });

    it('não toca em quem já tem alocação — o que foi definido à mão prevalece', async () => {
        listAllocationsForEmployees.mockResolvedValue({
            e1: [{ employee_id: 'e1', project_id: 'obraB', allocation_percent: 100 }],
        });

        renderTela([colaborador()]);

        await waitFor(() => expect(screen.getByText('Maria Silva')).toBeInTheDocument());
        await waitFor(() => expect(listAllocationsForEmployees).toHaveBeenCalled());
        expect(insertAutoAllocations).not.toHaveBeenCalled();
    });

    it('não aloca quando o centro de custo não tem obra vinculada', async () => {
        listAllocationsForEmployees.mockResolvedValue({});

        renderTela([colaborador({ cost_center_id: 'cc2' })]);

        await waitFor(() => expect(screen.getByText('Sem alocação')).toBeInTheDocument());
        expect(insertAutoAllocations).not.toHaveBeenCalled();
    });

    it('não repete a alocação automática de uma competência já aplicada (usuário apagou de propósito)', async () => {
        const hoje = new Date().toISOString().slice(0, 7);
        localStorage.setItem('laborAllocations:autoAplicado', JSON.stringify({ [hoje]: ['e1'] }));
        listAllocationsForEmployees.mockResolvedValue({});

        renderTela([colaborador()]);

        await waitFor(() => expect(screen.getByText('Sem alocação')).toBeInTheDocument());
        expect(insertAutoAllocations).not.toHaveBeenCalled();
    });
});

describe('LaborAllocations — cargo em coluna própria', () => {
    it('mostra o cabeçalho Cargo e o cargo fora da célula do colaborador', async () => {
        listAllocationsForEmployees.mockResolvedValue({
            e1: [{ employee_id: 'e1', project_id: 'obraA', allocation_percent: 100 }],
        });

        const { container } = renderTela([colaborador()]);

        await waitFor(() => expect(screen.getByText('Maria Silva')).toBeInTheDocument());
        expect(screen.getByRole('columnheader', { name: /Cargo/ })).toBeInTheDocument();
        expect(screen.getByText('Mestre de Obras')).toBeInTheDocument();

        // A célula do nome tem só o nome — o cargo empilhado embaixo saiu.
        const celulaNome = container.querySelector('tbody tr td');
        expect(celulaNome?.textContent).toBe('Maria Silva');
    });

    it('mostra "Sem cargo" quando o colaborador não tem função cadastrada', async () => {
        listAllocationsForEmployees.mockResolvedValue({
            e1: [{ employee_id: 'e1', project_id: 'obraA', allocation_percent: 100 }],
        });

        renderTela([colaborador({ role: '' })]);

        await waitFor(() => expect(screen.getByText('Sem cargo')).toBeInTheDocument());
    });
});
