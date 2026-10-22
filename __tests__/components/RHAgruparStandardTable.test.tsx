// @vitest-environment jsdom
/**
 * "Agrupar" nas tabelas do RH que usam o StandardTable (guia de UI §6.12).
 * Pedido de 22/10/2026: "implementar filtro agrupar em recursos humanos" +
 * "incluir também o botão de ordem de grupos (crescente e decrescente)".
 * docs/planos/2026-10-22-rh-agrupar.md
 *
 * Telas montadas de verdade com os serviços simulados: o cabeçalho do grupo traz a
 * contagem e, só onde há dinheiro, o total; Decrescente inverte a ordem dos grupos;
 * a seleção em lote do Ponto continua valendo com grupos recolhidos.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

// ── Dados ───────────────────────────────────────────────────────────
const PONTO = [
    { id: 't1', employee_id: 'e1', employee_name: 'Ana', project_name: 'Obra Garden', date: '2026-10-01', hours_worked: 8, overtime_hours: 0, total_cost: 1000, status: 'PENDENTE' },
    { id: 't2', employee_id: 'e2', employee_name: 'Bruno', project_name: 'Obra Garden', date: '2026-10-01', hours_worked: 8, overtime_hours: 0, total_cost: 500, status: 'APROVADO' },
    { id: 't3', employee_id: 'e3', employee_name: 'Carla', project_name: 'Obra Centro', date: '2026-10-02', hours_worked: 8, overtime_hours: 0, total_cost: 300, status: 'PENDENTE' },
    { id: 't4', employee_id: 'e4', employee_name: 'Davi', project_name: '', date: '2026-10-02', hours_worked: 8, overtime_hours: 0, total_cost: 200, status: 'PENDENTE' },
];
const medicao = (id: string, contractor_name: string, status: string, valor_liquido: number) => ({
    id, contractor_id: 'c1', contractor_name, project_name: 'Obra Garden', numero_medicao: Number(id.slice(1)),
    periodo_inicio: '2026-10-01', periodo_fim: '2026-10-15', valor_bruto: valor_liquido, valor_liquido, status,
});
const MEDICOES = [
    medicao('m1', 'Empreiteira Alfa', 'PENDENTE', 1000),
    medicao('m2', 'Empreiteira Beta', 'PAGO', 2000),
    medicao('m3', 'Empreiteira Alfa', 'APROVADO', 500),
    medicao('m4', 'Empreiteira Beta', 'PENDENTE', 300),
];
const ENTREGAS = [
    { id: 'd1', employee_id: 'e1', employee_name: 'Ana', epi_nome: 'Capacete', quantidade: 1, delivered_at: '2026-10-01', is_returned: false },
    { id: 'd2', employee_id: 'e1', employee_name: 'Ana', epi_nome: 'Luva', quantidade: 2, delivered_at: '2026-10-02', is_returned: false },
    { id: 'd3', employee_id: 'e2', employee_name: 'Bruno', epi_nome: 'Capacete', quantidade: 1, delivered_at: '2026-10-03', is_returned: true },
];

vi.mock('../../services/laborService', () => ({
    laborService: {
        listTimeEntries: vi.fn(async () => PONTO),
        approveTimeEntry: vi.fn(), rejectTimeEntry: vi.fn(), deleteTimeEntry: vi.fn(), createTimeEntry: vi.fn(),
        listContractors: vi.fn(async () => []),
        listContractorMeasurements: vi.fn(async () => MEDICOES),
        getContractorDocumentAlerts: vi.fn(async () => []),
        listEpiCatalog: vi.fn(async () => []), deleteEpiCatalogItem: vi.fn(), returnEpi: vi.fn(),
        listEpiDeliveries: vi.fn(async () => ENTREGAS),
        getEpiAlerts: vi.fn(async () => null),
    },
}));

import LaborTimeTracking from '../../components/LaborTimeTracking';
import LaborContractors from '../../components/LaborContractors';
import LaborEPIs from '../../components/LaborEPIs';

const comQuery = (ui: React.ReactElement) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;
const pedacos = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.replace(/ /g, ' ').trim()).filter(Boolean).join(' ');
const rotulosDosGrupos = () => Array.from(document.querySelectorAll('tbody span.font-semibold.text-slate-800')).map(e => e.textContent);
const agrupar = (title: string, campo: string) => fireEvent.change(screen.getByTitle(title), { target: { value: campo } });

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('RH › Ponto', () => {
    const montar = () => render(<LaborTimeTracking employees={[]} projects={[]} orgId="org1" onRefresh={() => {}} organizations={[{ id: 'org1', name: 'Alpa' }]} />);

    it('agrupa por obra com o total do custo; "Sem obra" no fim; Decrescente inverte', async () => {
        montar();
        await screen.findByText('Ana');
        agrupar('Agrupar os registros de ponto', 'obra');
        expect(rotulosDosGrupos()).toEqual(['Obra Centro', 'Obra Garden', 'Sem obra']);
        expect(pedacos('Obra Garden')).toBe('Obra Garden 2 R$ 1.500,00');
        expect(pedacos('Obra Centro')).toBe('Obra Centro 1 R$ 300,00');
        fireEvent.change(screen.getByRole('combobox', { name: 'Ordem dos grupos' }), { target: { value: 'desc' } });
        expect(rotulosDosGrupos()).toEqual(['Obra Garden', 'Obra Centro', 'Sem obra']);
    });

    it('status na ordem do fluxo (Pendente → Aprovado), com o código que a célula mostra', async () => {
        montar();
        await screen.findByText('Ana');
        agrupar('Agrupar os registros de ponto', 'status');
        expect(rotulosDosGrupos()).toEqual(['PENDENTE', 'APROVADO']);
        expect(pedacos('PENDENTE')).toBe('PENDENTE 3 R$ 1.500,00');
    });

    it('"selecionar todos" marca só as linhas pendentes à vista — grupo recolhido fica de fora', async () => {
        montar();
        await screen.findByText('Ana');
        agrupar('Agrupar os registros de ponto', 'obra');
        fireEvent.click(cabecalho('Obra Garden'));
        expect(screen.queryByText('Ana')).toBeNull();
        const [todos] = screen.getAllByRole('checkbox');
        fireEvent.click(todos);
        // Carla (Obra Centro) e Davi (Sem obra); Ana está no grupo recolhido.
        expect(screen.getByText('2 selecionados')).toBeTruthy();
    });
});

describe('RH › Empreiteiros › Medições', () => {
    it('agrupa por status na ordem do fluxo, com o total líquido; Decrescente inverte', async () => {
        comQuery(<LaborContractors orgId="org1" organizations={[{ id: 'org1', name: 'Alpa' }]} onRefresh={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: /^Medições/ }));
        await screen.findAllByText('Empreiteira Alfa');
        agrupar('Agrupar as medições', 'status');
        expect(rotulosDosGrupos()).toEqual(['PENDENTE', 'APROVADO', 'PAGO']);
        expect(pedacos('PENDENTE')).toBe('PENDENTE 2 R$ 1.300,00');
        expect(pedacos('PAGO')).toBe('PAGO 1 R$ 2.000,00');
        fireEvent.change(screen.getByRole('combobox', { name: 'Ordem dos grupos' }), { target: { value: 'desc' } });
        expect(rotulosDosGrupos()).toEqual(['PAGO', 'APROVADO', 'PENDENTE']);
    });
});

describe('RH › EPIs › Entregas', () => {
    it('agrupa por colaborador só com a contagem (sem "R$") e recolhe', async () => {
        comQuery(<LaborEPIs orgId="org1" employees={[]} organizations={[{ id: 'org1', name: 'Alpa' }]} />);
        fireEvent.click(screen.getByRole('tab', { name: /^Entregas/ }));
        await screen.findAllByText('Luva');
        agrupar('Agrupar as entregas', 'colaborador');
        expect(rotulosDosGrupos()).toEqual(['Ana', 'Bruno']);
        expect(pedacos('Ana')).toBe('Ana 2');
        expect(pedacos('Bruno')).toBe('Bruno 1');
        expect(document.querySelector('tbody')!.textContent).not.toContain('R$');
        fireEvent.click(cabecalho('Ana'));
        expect(screen.queryByText('Luva')).toBeNull();
    });

    it('status Em uso → Devolvido, como a célula mostra', async () => {
        comQuery(<LaborEPIs orgId="org1" employees={[]} organizations={[{ id: 'org1', name: 'Alpa' }]} />);
        fireEvent.click(screen.getByRole('tab', { name: /^Entregas/ }));
        await screen.findAllByText('Luva');
        agrupar('Agrupar as entregas', 'status');
        expect(rotulosDosGrupos()).toEqual(['Em uso', 'Devolvido']);
        expect(pedacos('Em uso')).toBe('Em uso 2');
    });
});
