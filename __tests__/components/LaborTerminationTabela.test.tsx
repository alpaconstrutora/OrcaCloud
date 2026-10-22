// @vitest-environment jsdom
/**
 * RH › Desligamentos virou tabela padrão (guia de UI §6.10) com toolbar de abas (§19.1)
 * e botão de ajuste de colunas (§6.1.2). Pedido de 22/10/2026:
 * "recursos humanos > desligamentos: Transformar em tabela e aplicar o padrão
 * ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas".
 * docs/planos/2026-10-22-rh-desligamentos-tabela.md
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

const processo = (id: string, employee_name: string, status: 'RASCUNHO' | 'CONCLUIDO', checklist: string[] = []) => ({
    id, org_id: 'org1', employee_id: `e-${id}`, employee_name, employee_role: 'Pedreiro',
    termination_date: '2026-10-05', tipo: 'PEDIDO_DEMISSAO', aviso_previo_tipo: 'TRABALHADO',
    checklist, entrevista_realizada: false, epis_devolvidos: false, acessos_bloqueados: false, status,
});
const PROCESSOS = [
    processo('p1', 'Ana', 'RASCUNHO', ['docs_trct', 'docs_aviso']),
    processo('p2', 'Bruno', 'CONCLUIDO'),
    processo('p3', 'Carla', 'RASCUNHO'),
];

const listTerminations = vi.fn(async () => PROCESSOS);
const deleteTermination = vi.fn(async () => undefined);
vi.mock('../../services/laborService', () => ({
    laborService: {
        listTerminations: (...a: unknown[]) => listTerminations(...(a as [])),
        deleteTermination: (...a: unknown[]) => deleteTermination(...(a as [])),
        createTermination: vi.fn(), updateTermination: vi.fn(), finalizeTermination: vi.fn(),
    },
}));

import LaborTermination from '../../components/LaborTermination';

const montar = (employees: any[] = []) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <LaborTermination orgId="org1" employees={employees} organizations={[{ id: 'org1', name: 'Alpa' }]} />
        </QueryClientProvider>,
    );
};
const linhas = () => Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.textContent ?? '');
const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome });

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('RH › Desligamentos — tabela padrão', () => {
    it('abas recortam por situação, com contador; começa em "Em andamento"', async () => {
        montar();
        await screen.findByText('Ana');
        expect(aba(/Em andamento/)).toHaveAttribute('aria-selected', 'true');
        expect(aba(/Em andamento/).textContent).toContain('2');
        expect(aba(/Concluídos/).textContent).toContain('1');
        expect(aba(/Todos/).textContent).toContain('3');
        expect(linhas().some(l => l.includes('Bruno'))).toBe(false);

        fireEvent.click(aba(/Concluídos/));
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0]).toContain('Bruno');

        fireEvent.click(aba(/Todos/));
        expect(linhas()).toHaveLength(3);
    });

    it('é <table> com cabeçalho sentence case, data formatada, checklist em percentual e status em texto', async () => {
        montar();
        await screen.findByText('Ana');
        const cabecalhos = Array.from(document.querySelectorAll('thead th')).map(th => th.textContent?.trim()).filter(Boolean);
        expect(cabecalhos).toEqual(['Colaborador', 'Cargo', 'Tipo', 'Data', 'Aviso prévio', 'Checklist', 'Status', 'Ações']);
        const ana = screen.getByText('Ana').closest('tr')!;
        expect(within(ana).getByText('05/10/2026')).toBeInTheDocument();
        expect(within(ana).getByText('Trabalhado')).toBeInTheDocument();
        expect(within(ana).getByText('14%')).toBeInTheDocument(); // 2 de 14 itens
        expect(within(ana).getByText('Em andamento').className).not.toMatch(/rounded-full|uppercase|bg-/);
    });

    it('toolbar acoplada tem a engrenagem de colunas e o ajuste de largura', async () => {
        montar();
        await screen.findByText('Ana');
        expect(screen.getByTitle('Ajustar largura das colunas ao conteúdo')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Buscar colaborador, cargo ou tipo...')).toBeInTheDocument();
        expect(screen.getByTitle('Agrupar os desligamentos')).toBeInTheDocument();
    });

    it('sem colaborador elegível, "Iniciar desligamento" fica desligado e diz o motivo', async () => {
        montar([]);
        await screen.findByText('Ana');
        const botao = screen.getByRole('button', { name: /Iniciar desligamento/ });
        expect(botao).toBeDisabled();
        expect(botao.parentElement).toHaveAttribute('title', expect.stringContaining('Nenhum colaborador'));
    });

    it('com colaborador elegível o botão fica ligado', async () => {
        montar([{ id: 'novo', name: 'Davi', role: 'Servente', status: 'ATIVO' }]);
        await screen.findByText('Ana');
        expect(screen.getByRole('button', { name: /Iniciar desligamento/ })).toBeEnabled();
    });

    it('excluir tira a linha sem refazer a consulta (§22)', async () => {
        montar();
        await screen.findByText('Carla');
        expect(listTerminations).toHaveBeenCalledTimes(1);
        const carla = screen.getByText('Carla').closest('tr')!;
        fireEvent.click(within(carla).getByTitle('Excluir'));
        await waitFor(() => expect(screen.queryByText('Carla')).not.toBeInTheDocument());
        expect(deleteTermination).toHaveBeenCalledWith('p3');
        expect(listTerminations).toHaveBeenCalledTimes(1);
        expect(aba(/Em andamento/).textContent).toContain('1');
    });
});
