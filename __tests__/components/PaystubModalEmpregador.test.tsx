// @vitest-environment jsdom
/**
 * Recibo de pagamento (24/10/2026): o empregador era fixo no código ("OPURA PRO",
 * CNPJ 00.000.000/0001-00, "Unidade Operacional - Obra Garden"). Agora vem da
 * organização DA FOLHA — não da selecionada no topo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

const payroll = vi.hoisted(() => ({
    getRun: vi.fn().mockResolvedValue({ id: 'run-1', org_id: 'org-garden', type: 'mensal', start_date: '2026-06-01', end_date: '2026-06-30', status: 'FECHADO' }),
    getPayrollResult: vi.fn().mockResolvedValue({ employee_id: 'rog', gross: 1621, discounts: 121.57, net: 1499.43, base_inss: 1621, base_fgts: 1621, base_irrf: 1499.43, employee: { name: 'Rogério da Silva Santos', cpf: '082.849.996-92', role: 'Servente' } }),
    getEmployeeItems: vi.fn().mockResolvedValue([]),
    listRubrics: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn().mockResolvedValue([]),
    getOrganizacaoDoHolerite: vi.fn().mockResolvedValue({
        name: 'Construção do Edifício Garden Cambuhy SPE', cnpj: '60.897.254/0001-86', address: {}, settings: {},
    }),
}));
vi.mock('../../services/payrollService', () => ({ payrollService: payroll }));

import PaystubModal from '../../components/PaystubModal';

describe('PaystubModal — empregador', () => {
    it('mostra nome e CNPJ da organização da folha, sem o texto fixo antigo', async () => {
        render(<PaystubModal orgId="all" runId="run-1" employeeId="rog" onClose={vi.fn()} />);

        expect(await screen.findByText('Construção do Edifício Garden Cambuhy SPE')).toBeTruthy();
        expect(screen.getByText('CNPJ: 60.897.254/0001-86')).toBeTruthy();
        expect(payroll.getOrganizacaoDoHolerite).toHaveBeenCalledWith('org-garden');
        expect(screen.queryByText(/Opura Pro/i)).toBeNull();
        expect(screen.queryByText(/00\.000\.000\/0001-00/)).toBeNull();
        expect(screen.queryByText(/Endereço:/)).toBeNull(); // Garden não tem endereço cadastrado
    });
});
