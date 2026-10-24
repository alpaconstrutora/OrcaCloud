// @vitest-environment jsdom
/**
 * RH › Custos, tela vazia. Até 24/10/2026 o botão "Adicionar Colaborador"
 * chamava `onMigrate` — a IMPORTAÇÃO do sistema antigo (`migrateLegacyWorkers`),
 * que lia `organizations.resources.workers` (a biblioteca de Trabalhadores do
 * Planejamento), criava colaboradores só checando o nome na org do topo e depois
 * esvaziava a biblioteca. Foi assim que nasceu o Rogério duplicado na Garden
 * (22/10). A importação saiu; o botão abre o formulário de novo colaborador.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('recharts', () => {
    const Vazio = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return { BarChart: Vazio, Bar: Vazio, XAxis: Vazio, YAxis: Vazio, CartesianGrid: Vazio, Tooltip: Vazio, ResponsiveContainer: Vazio, Cell: Vazio, Legend: Vazio };
});
vi.mock('../../services/laborService', () => ({
    laborService: { getCostSummary: vi.fn().mockResolvedValue({ totalCost: 0, totalHours: 0, byEmployee: [], byProject: [], byTeam: [] }) },
}));

import LaborCosts from '../../components/LaborCosts';

describe('LaborCosts — tela vazia', () => {
    it('"Adicionar Colaborador" abre o formulário de novo colaborador, e não há importação do sistema antigo', async () => {
        const onNewEmployee = vi.fn();
        render(<LaborCosts employees={[]} teams={[]} projects={[]} orgId="org-1" organizations={[]} onRefresh={vi.fn()} onNewEmployee={onNewEmployee} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Adicionar Colaborador' }));
        expect(onNewEmployee).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/sistema antigo|legad|Importar/i)).toBeNull();
    });
});
