// @vitest-environment jsdom
/**
 * "Agrupar" no Vale Refeição (Cálculo Mensal, Histórico) e em Treinamentos › Registros
 * — tabelas feitas à mão (guia de UI §6.12). Pedido de 22/10/2026: "implementar filtro
 * agrupar em recursos humanos" + "incluir também o botão de ordem de grupos (crescente
 * e decrescente)". docs/planos/2026-10-22-rh-agrupar.md
 *
 * Telas montadas de verdade com os serviços simulados: rótulo do grupo = texto da
 * célula; total (Líquido) só no VR; Decrescente inverte e o "Sem …" fica no fim; o
 * "selecionar todos" do Cálculo ignora o grupo recolhido; o ajuste inline continua.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
}));

// ── Dados ───────────────────────────────────────────────────────────
const calculo = (id: string, mes_referencia: string, employee_name: string, project_name: string, valor_liquido: number, status: string) => ({
    id, org_id: 'org1', regra_id: 'r1', employee_id: `e-${id}`, project_id: project_name ? 'p1' : null, mes_referencia,
    dias_uteis: 22, dias_faltas: 0, dias_ferias: 0, dias_afastamento: 0, dias_outros: 0, dias_elegiveis: 20,
    valor_diario: 5, valor_bruto: valor_liquido, desconto_folha: 0, valor_liquido, status,
    aprovado_por: null, aprovado_em: null, observacao: null, created_at: '', updated_at: '',
    employee_name, project_name,
});
const HISTORICO = [
    calculo('h1', '2026-09-01', 'Ana', 'Obra Garden', 100, 'aprovado'),
    calculo('h2', '2026-08-01', 'Bruno', '', 50, 'pago'),
    calculo('h3', '2026-09-01', 'Carla', 'Obra Centro', 200, 'rascunho'),
];
const CALCULO_MES = [
    calculo('c1', '2026-10-01', 'Ana', 'Obra Garden', 100, 'rascunho'),
    calculo('c2', '2026-10-01', 'Bruno', 'Obra Garden', 150, 'aprovado'),
    calculo('c3', '2026-10-01', 'Carla', '', 70, 'rascunho'),
];
const REGISTROS = [
    { id: 't1', org_id: 'org1', employee_id: 'e1', employee_name: 'Ana', course_id: 'k1', course_nome: 'Trabalho em altura', nr_referencia: 'NR-35', data_realizacao: '2026-01-10', aprovado: true, status: 'ATIVO', origem: 'PRESENCIAL' },
    { id: 't2', org_id: 'org1', employee_id: 'e2', employee_name: 'Bruno', course_id: 'k2', course_nome: 'Integração', data_realizacao: '2026-02-10', aprovado: true, status: 'ATIVO', origem: 'ACADEMIA' },
    { id: 't3', org_id: 'org1', employee_id: 'e3', employee_name: 'Carla', course_id: 'k1', course_nome: 'Trabalho em altura', nr_referencia: 'NR-35', data_realizacao: '2024-01-10', data_validade: '2025-01-10', aprovado: true, status: 'VENCIDO', origem: 'PRESENCIAL' },
    { id: 't4', org_id: 'org1', employee_id: 'e4', employee_name: 'Davi', course_id: 'k2', course_nome: 'Integração', data_realizacao: '2026-03-10', aprovado: false, status: 'PENDENTE', origem: 'ACADEMIA' },
];

vi.mock('../../services/vrService', () => ({
    vrService: {
        listRegras: vi.fn(async () => []),
        listFeriados: vi.fn(async () => []),
        // Sem mês = Histórico (todos); com mês = Cálculo Mensal.
        listCalculos: vi.fn(async (_org: unknown, mes?: string) => (mes ? CALCULO_MES : HISTORICO)),
        aprovarLote: vi.fn(), ajustarCalculo: vi.fn(),
    },
}));
vi.mock('../../services/laborService', () => ({ laborService: { listTeams: vi.fn(async () => []) } }));
vi.mock('../../services/trainingsService', () => ({
    trainingsService: {
        listTrainingCourses: vi.fn(async () => []),
        listEmployeeTrainings: vi.fn(async () => REGISTROS),
        getTrainingAlerts: vi.fn(async () => []),
    },
}));
vi.mock('../../services/academyService', () => ({ academyService: {} }));

import LaborValeRefeicao from '../../components/LaborValeRefeicao';
import LaborTrainings from '../../components/LaborTrainings';

const comQuery = (ui: React.ReactElement) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'tbody span.font-semibold' }).closest('div')!;
const pedacos = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.replace(/ /g, ' ').trim()).filter(Boolean).join(' ');
const rotulosDosGrupos = () => Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);
const agrupar = (title: string, campo: string) => fireEvent.change(screen.getByTitle(title), { target: { value: campo } });
const decrescente = () => fireEvent.change(screen.getByRole('combobox', { name: 'Ordem dos grupos' }), { target: { value: 'desc' } });

const vr = () => <LaborValeRefeicao orgId="org1" organizations={[{ id: 'org1', name: 'Alpa' }]} employees={[]} projects={[]} onRefresh={() => {}} />;

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('VR › Histórico', () => {
    beforeEach(() => window.localStorage.setItem('laborValeRefeicao:tab', JSON.stringify('historico')));

    it('agrupa por Mês em ordem cronológica, com o texto da célula e o total do Líquido', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar o histórico', 'mes');
        expect(rotulosDosGrupos()).toEqual(['Agosto de 2026', 'Setembro de 2026']);
        expect(pedacos('Setembro de 2026')).toBe('Setembro de 2026 2 R$ 300,00');
        expect(pedacos('Agosto de 2026')).toBe('Agosto de 2026 1 R$ 50,00');
        decrescente();
        expect(rotulosDosGrupos()).toEqual(['Setembro de 2026', 'Agosto de 2026']);
    });

    it('recolher o grupo esconde as linhas dele', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar o histórico', 'mes');
        fireEvent.click(cabecalho('Setembro de 2026'));
        expect(screen.queryByText('Carla')).toBeNull();
        expect(screen.getByText('Bruno')).toBeTruthy();
    });

    it('"Sem obra" fica no fim em Crescente e em Decrescente; status na ordem do fluxo', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar o histórico', 'project');
        expect(rotulosDosGrupos()).toEqual(['Obra Centro', 'Obra Garden', 'Sem obra']);
        decrescente();
        expect(rotulosDosGrupos()).toEqual(['Obra Garden', 'Obra Centro', 'Sem obra']);
        agrupar('Agrupar o histórico', 'status');
        // Decrescente continua escolhido: Pago → Aprovado → Rascunho.
        expect(rotulosDosGrupos()).toEqual(['Pago', 'Aprovado', 'Rascunho']);
    });
});

describe('VR › Cálculo Mensal', () => {
    beforeEach(() => window.localStorage.setItem('laborValeRefeicao:tab', JSON.stringify('calculo')));

    it('agrupa por Obra com o total do Líquido; "Sem obra" no fim', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar os cálculos', 'project');
        expect(rotulosDosGrupos()).toEqual(['Obra Garden', 'Sem obra']);
        expect(pedacos('Obra Garden')).toBe('Obra Garden 2 R$ 250,00');
        expect(pedacos('Sem obra')).toBe('Sem obra 1 R$ 70,00');
        // A linha de grupo ocupa a linha inteira: checkbox + dados + espaçador + Ações.
        const linhaDeDado = screen.getByText('Ana').closest('tr')!;
        expect(cabecalho('Obra Garden').closest('td')!.colSpan).toBe(linhaDeDado.children.length);
    });

    it('"selecionar todos" marca só os rascunhos que estão na tela (grupo recolhido fica de fora)', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar os cálculos', 'project');
        fireEvent.click(cabecalho('Obra Garden'));
        fireEvent.click(document.querySelector('thead input[type="checkbox"]')!);
        expect(screen.getByText('1 selecionado')).toBeTruthy();
    });

    it('o ajuste inline de "Elegíveis" continua funcionando com grupos', async () => {
        comQuery(vr());
        await screen.findAllByText('Carla');
        agrupar('Agrupar os cálculos', 'project');
        fireEvent.click(screen.getAllByTitle('Ajustar dias elegíveis')[0]);
        expect(screen.getByRole('spinbutton')).toBeTruthy();
        expect(screen.getByPlaceholderText('Motivo do ajuste*')).toBeTruthy();
    });
});

describe('Treinamentos › Registros', () => {
    beforeEach(() => window.localStorage.setItem('laborTrainings:view', JSON.stringify('records')));

    it('agrupa por Status (texto da célula), na ordem do filtro, só com contagem', async () => {
        comQuery(<LaborTrainings orgId="org1" employees={[]} organizations={[{ id: 'org1', name: 'Alpa' }]} />);
        await screen.findAllByText('Davi');
        agrupar('Agrupar os registros', 'status');
        expect(rotulosDosGrupos()).toEqual(['ATIVO', 'VENCIDO', 'PENDENTE']);
        expect(pedacos('ATIVO')).toBe('ATIVO 2');
        expect(cabecalho('ATIVO').textContent).not.toContain('R$');
        decrescente();
        expect(rotulosDosGrupos()).toEqual(['PENDENTE', 'VENCIDO', 'ATIVO']);
    });

    it('agrupa por Treinamento pelo nome do curso (a NR não entra no rótulo)', async () => {
        comQuery(<LaborTrainings orgId="org1" employees={[]} organizations={[{ id: 'org1', name: 'Alpa' }]} />);
        await screen.findAllByText('Davi');
        agrupar('Agrupar os registros', 'course');
        expect(rotulosDosGrupos()).toEqual(['Integração', 'Trabalho em altura']);
        expect(pedacos('Trabalho em altura')).toBe('Trabalho em altura 2');
        const linhaDeDado = screen.getByText('Ana').closest('tr')!;
        expect(cabecalho('Integração').closest('td')!.colSpan).toBe(linhaDeDado.children.length);
    });
});
