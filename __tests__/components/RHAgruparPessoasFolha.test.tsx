// @vitest-environment jsdom
/**
 * "Agrupar" em Recursos Humanos — Colaboradores, Folha › Ciclos de folha e
 * Rubricas (tabelas feitas à mão). Pedido de 22/10/2026,
 * docs/planos/2026-10-22-rh-agrupar.md. Guia de UI §6.12.
 *
 * O cabeçalho do grupo traz a contagem e, onde há dinheiro, o total; o rótulo é o
 * MESMO texto da célula; "Decrescente" inverte os grupos e o "Sem …" fica no fim.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Employee } from '../../services/laborService';
import type { PayrollRun } from '../../services/payrollService';

const { RUBRICAS } = vi.hoisted(() => ({
    RUBRICAS: [
        { code: 'R1', name: 'Salário', type: 'provento', active: true },
        { code: 'R2', name: 'INSS', type: 'desconto', active: true },
        { code: 'R3', name: 'Hora extra', type: 'provento', active: true },
        { code: 'R4', name: 'Base FGTS', type: 'informativa', active: true },
    ],
}));

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: [], error: null })) } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
}));
vi.mock('../../services/laborService', () => ({ laborService: { updateEmployee: vi.fn(), removeEmployee: vi.fn() } }));
vi.mock('../../services/payrollService', () => ({
    payrollService: { listRubrics: vi.fn(async () => RUBRICAS), isRubricUsed: vi.fn(async () => false) },
}));

import LaborEmployeeList from '../../components/LaborEmployeeList';
import PayrollRunList from '../../components/PayrollRunList';
import LaborRubrics from '../../components/LaborRubrics';

const corpo = () => within(document.querySelector('tbody')!);
const cabecalho = (rotulo: string) => corpo().getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;
const pedacos = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.trim()).filter(Boolean).join(' ');
const rotulos = () => Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);
const agrupar = (title: string, campo: string) => fireEvent.change(screen.getByTitle(title), { target: { value: campo } });
const decrescente = () => fireEvent.change(screen.getByRole('combobox', { name: 'Ordem dos grupos' }), { target: { value: 'desc' } });

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('Colaboradores', () => {
    const emp = (id: string, name: string, contract_type: string | undefined, base_salary: number): Employee => ({
        id, name, role: 'Pedreiro', cpf: '', org_id: 'org1', contract_type, status: 'ATIVO', base_salary, daily_cost: 0, hourly_cost: 0,
    } as unknown as Employee);
    const EMPREGADOS = [
        emp('e1', 'Ana', 'CLT', 3000),
        emp('e2', 'Bruno', 'PJ', 8000),
        emp('e3', 'Carla', 'CLT', 2000),
        emp('e4', 'Davi', undefined, 1500),
        emp('e5', 'Eva', 'DIARISTA', 500),
    ];
    const tela = () => render(
        <LaborEmployeeList employees={EMPREGADOS} projects={[]} organizations={[{ id: 'org1', name: 'Alpa' }]}
            onEdit={vi.fn()} onNew={vi.fn()} onRefresh={vi.fn()} isAllOrgsMode={false} />,
    );

    it('agrupa por Vínculo com contagem e total do salário base; "Sem vínculo" por último', () => {
        tela();
        agrupar('Agrupar os colaboradores', 'vinculo');
        expect(rotulos()).toEqual(['CLT', 'Diarista', 'PJ', 'Sem vínculo']);
        expect(pedacos('CLT')).toMatch(/^CLT 2 R\$\s?5\.000,00$/);
        expect(pedacos('PJ')).toMatch(/^PJ 1 R\$\s?8\.000,00$/);
        expect(pedacos('Sem vínculo')).toMatch(/^Sem vínculo 1 R\$\s?1\.500,00$/);
    });

    it('Decrescente inverte os grupos e mantém o "Sem …" no fim', () => {
        tela();
        agrupar('Agrupar os colaboradores', 'vinculo');
        decrescente();
        expect(rotulos()).toEqual(['PJ', 'Diarista', 'CLT', 'Sem vínculo']);
    });

    it('recolher o grupo esconde as linhas dele', () => {
        tela();
        agrupar('Agrupar os colaboradores', 'vinculo');
        fireEvent.click(cabecalho('CLT'));
        expect(corpo().queryByText('Ana')).toBeNull();
        expect(corpo().getByText('Bruno')).toBeTruthy();
    });

    it('cabeçalho do grupo ocupa todas as células da linha (dados + espaçador + Ações)', () => {
        tela();
        agrupar('Agrupar os colaboradores', 'vinculo');
        const celulasDaLinha = corpo().getByText('Ana').closest('tr')!.children.length;
        expect(Number(cabecalho('CLT').closest('td')!.getAttribute('colspan'))).toBe(celulasDaLinha);
    });

    it('com uma só organização a coluna some e "Organização" não é opção', () => {
        tela();
        const opcoes = Array.from(screen.getByTitle('Agrupar os colaboradores').querySelectorAll('option')).map(o => o.textContent);
        expect(opcoes).toEqual(['Agrupar', 'Função', 'Vínculo', 'Status']);
    });
});

describe('Folha › Ciclos de folha', () => {
    const run = (id: string, status: string, type: PayrollRun['type']): PayrollRun => ({
        id, org_id: 'org1', start_date: '2026-09-01', end_date: '2026-09-30', status, type,
    });
    const CICLOS = [run('r1', 'FECHADO', 'mensal'), run('r2', 'RASCUNHO', 'mensal'), run('r3', 'FECHADO', 'adiantamento')];
    const tela = () => render(
        <PayrollRunList runs={CICLOS} orgId="org1" organizations={[{ id: 'org1', name: 'Alpa' }]} costCenters={[]} planoContas={[]}
            loading={false} typeFilter="all" monthFilter="all" yearFilter="all" search="" runTotals={{ r1: 1000, r2: 250, r3: 400 }}
            onTypeFilter={vi.fn()} onMonthFilter={vi.fn()} onYearFilter={vi.fn()} onSearch={vi.fn()}
            onSelectRun={vi.fn()} onDeleteRun={vi.fn()} onDuplicateRun={vi.fn()} onNewRun={vi.fn()} onRefresh={vi.fn()} />,
    );

    it('agrupa por Status na ordem do fluxo (Rascunho → Fechado) com o total do valor', () => {
        tela();
        agrupar('Agrupar os ciclos de folha', 'status');
        expect(rotulos()).toEqual(['Rascunho', 'Fechado']);
        expect(pedacos('Fechado')).toMatch(/^Fechado 2 R\$\s?1\.400,00$/);
        expect(pedacos('Rascunho')).toMatch(/^Rascunho 1 R\$\s?250,00$/);
        decrescente();
        expect(rotulos()).toEqual(['Fechado', 'Rascunho']);
    });

    it('sem centro de custo, todos caem em "Sem centro de custo"', () => {
        tela();
        agrupar('Agrupar os ciclos de folha', 'centro_custo');
        expect(pedacos('Sem centro de custo')).toMatch(/^Sem centro de custo 3 R\$\s?1\.650,00$/);
    });
});

describe('Rubricas', () => {
    it('agrupa por Tipo na ordem do fluxo, só com a contagem (sem dinheiro)', async () => {
        render(<LaborRubrics />);
        await screen.findByText('Hora extra');
        agrupar('Agrupar as rubricas', 'tipo');
        expect(rotulos()).toEqual(['Provento', 'Desconto', 'Informativa']);
        expect(pedacos('Provento')).toBe('Provento 2');
        expect(pedacos('Desconto')).toBe('Desconto 1');
        decrescente();
        expect(rotulos()).toEqual(['Informativa', 'Desconto', 'Provento']);
    });
});
