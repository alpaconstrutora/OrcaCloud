// @vitest-environment jsdom
/**
 * Folha › lançamento manual › Excluir: confirmação pelo diálogo do app (`useConfirm`, guia §14), não
 * pelo `confirm()` nativo do navegador. Pedido de 16/11/2026 ("corrigir… Alertas antigos" —
 * `check-ui-standard.sh` acusava o `confirm()` nativo em PayrollEventModal.tsx).
 * Cancelar não exclui; confirmar exclui e recalcula a folha do colaborador.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { PayrollEvent, PayrollRun } from '../../services/payrollService';

const { servico, motor } = vi.hoisted(() => ({
    servico: {
        getEmployeeItems: vi.fn(async () => []),
        getEmployeeRecurringRubrics: vi.fn(async () => []),
        listAuditLogs: vi.fn(async () => []),
        deleteEvent: vi.fn(async () => undefined),
    },
    motor: { calculateEmployeePayroll: vi.fn(async () => undefined) },
}));

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../services/payrollService', () => ({ payrollService: servico }));
vi.mock('../../services/payrollEngine', () => ({ payrollEngine: motor }));

import PayrollEventModal from '../../components/PayrollEventModal';
import { ConfirmProvider } from '../../components/ui/confirm';

const CICLO = { id: 'run1', status: 'ABERTO', organization_id: 'org1' } as unknown as PayrollRun;
const LANCAMENTO = {
    id: 'ev1', employee_id: 'emp1', rubric_code: 'R3', description: 'Hora extra', type: 'provento', amount: 150,
} as unknown as PayrollEvent;

function abrir(onEventSaved = vi.fn(async () => undefined)) {
    render(
        <ConfirmProvider>
            <PayrollEventModal
                run={CICLO} orgId="org1" employeeId="emp1" employeeName="Fulano"
                rubrics={[]} runEvents={[LANCAMENTO]} results={[]} executing={false}
                onClose={() => {}} onEventSaved={onEventSaved}
            />
        </ConfirmProvider>,
    );
    return onEventSaved;
}

describe('Folha › excluir lançamento manual', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pergunta no diálogo do app, nunca no confirm() nativo; cancelar não exclui', async () => {
        const nativo = vi.spyOn(window, 'confirm');
        abrir();
        fireEvent.click(screen.getByTitle('Excluir Lançamento'));
        expect(await screen.findByText('Excluir lançamento manual?')).toBeTruthy();
        expect(screen.getByText(/o cálculo deste colaborador é refeito/)).toBeTruthy();
        expect(nativo).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByText('Excluir lançamento manual?')).toBeNull());
        expect(servico.deleteEvent).not.toHaveBeenCalled();
    });

    it('confirmar exclui o lançamento e recalcula a folha do colaborador', async () => {
        const salvo = abrir();
        fireEvent.click(screen.getByTitle('Excluir Lançamento'));
        fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
        await waitFor(() => expect(servico.deleteEvent).toHaveBeenCalledWith('ev1'));
        await waitFor(() => expect(motor.calculateEmployeePayroll).toHaveBeenCalledWith('emp1', 'run1'));
        expect(salvo).toHaveBeenCalled();
    });
});
