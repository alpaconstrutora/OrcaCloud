// @vitest-environment jsdom
/**
 * ÒPURA · Relatórios › dimensão "Centro de Custo" — colunas Grupo de centro de
 * custo / Centro de custo, "Agrupar" pelo grupo (abre agrupado, com Crescente/
 * Decrescente) e o botão de recolher/expandir todos (guia §6.12).
 * Pedido de 13/11/2026, docs/planos/2026-11-13-relatorios-centro-de-custo-colunas-agrupar.md
 * (substitui a árvore numa coluna só de 13/09/2026).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/opuraAnalyticsService', async () => {
    const real = await vi.importActual<typeof import('../../services/opuraAnalyticsService')>('../../services/opuraAnalyticsService');
    return {
        ...real,
        opuraAnalyticsService: {
            ...real.opuraAnalyticsService,
            pivot: vi.fn(async () => [
                { dimension_key: null,      dimension_label: '— Sem centro de custo',          qtd: 522, credit_realizado: 0, debit_realizado: 148835, credit_previsto: 0, debit_previsto: 0,   net_realizado: -148835, vencido: 0 },
                { dimension_key: 'adm',     dimension_label: 'Administrativo',                 qtd: 149, credit_realizado: 0, debit_realizado: 34482,  credit_previsto: 0, debit_previsto: 0,   net_realizado: -34482,  vencido: 0 },
                { dimension_key: 'bella',   dimension_label: 'Condomínios › 007 - Bella Vista', qtd: 50, credit_realizado: 0, debit_realizado: 23817,  credit_previsto: 0, debit_previsto: 0,   net_realizado: -23817,  vencido: 0 },
                { dimension_key: 'galeria', dimension_label: 'Condomínios › 010 - Galeria Altavista', qtd: 12, credit_realizado: 0, debit_realizado: 0, credit_previsto: 0, debit_previsto: 0, net_realizado: 0, vencido: 0 },
                { dimension_key: 'manut',   dimension_label: 'Ativos › Manutenção',            qtd: 1,   credit_realizado: 0, debit_realizado: 0,      credit_previsto: 0, debit_previsto: 360, net_realizado: 0,       vencido: 0 },
            ]),
            entries: vi.fn(async () => []),
            compare: vi.fn(async () => [
                { dimension_key: 'adm', dimension_label: 'Administrativo', valorA: -34482, valorB: -30000, delta: -4482, variacao: -14.9 },
            ]),
        },
    };
});
vi.mock('../../services/costCenterService', () => ({
    costCenterService: {
        list: vi.fn(async () => [
            { id: 'obra',    organization_id: 'org1', parent_id: null,     code: '001', name: 'Obra' },
            { id: 'adm',     organization_id: 'org1', parent_id: null,     code: '002', name: 'Administrativo' },
            { id: 'cond',    organization_id: 'org1', parent_id: null,     code: '006', name: 'Condomínios' },
            { id: 'galeria', organization_id: 'org1', parent_id: 'cond',   code: '010', name: '010 - Galeria Altavista' },
            { id: 'bella',   organization_id: 'org1', parent_id: 'cond',   code: '011', name: '007 - Bella Vista' },
            { id: 'ativos',  organization_id: 'org1', parent_id: null,     code: '020', name: 'Ativos' },
            { id: 'manut',   organization_id: 'org1', parent_id: 'ativos', code: '021', name: 'Manutenção' },
        ]),
    },
}));
// `showToast` estável: no hook real é memoizado; um vi.fn() novo por render
// mudaria a identidade de `load` e recarregaria o relatório a cada clique.
const showToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ localToast: null, showToast }),
}));

import OpuraReports from '../../components/OpuraReports';
import { ConfirmProvider } from '../../components/ui/confirm';

async function abrirCentroDeCusto() {
    // `ConfirmProvider` vem do root do app (Sheet usa useConfirm).
    render(<ConfirmProvider><OpuraReports organizationId="org1" /></ConfirmProvider>);
    // A dimensão é uma aba (§19.1 TabsBar → role="tab")
    fireEvent.click(await screen.findByRole('tab', { name: 'Centro de Custo' }));
    await waitFor(() => expect(screen.getByText('Manutenção')).toBeInTheDocument());
}

const linhaDe = (texto: string) => screen.getByText(texto).closest('tr') as HTMLTableRowElement;
const textosDasLinhas = () => screen.getAllByRole('row').map(r => r.textContent ?? '');
const posicoes = (ordem: string[]) => {
    const linhas = textosDasLinhas();
    return ordem.map(t => linhas.findIndex(r => r.includes(t)));
};
const agrupar = () => screen.getByTitle('Agrupar os centros de custo') as HTMLSelectElement;

describe('ÒPURA · Relatórios › Centro de Custo — colunas Grupo / Centro de custo + Agrupar', () => {
    // Filtros/abas/modo persistem em localStorage (§3): cada teste parte limpo.
    beforeEach(() => localStorage.clear());

    it('tem as colunas "Grupo de centro de custo" e "Centro de custo", ordenáveis', async () => {
        await abrirCentroDeCusto();
        expect(screen.getByRole('columnheader', { name: /Grupo de centro de custo/ })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /^Centro de custo/ })).toBeInTheDocument();
        // Lista plana: sem o cabeçalho de grupo repetindo o mesmo texto da célula
        fireEvent.change(agrupar(), { target: { value: 'none' } });
        // Cada centro mostra o seu grupo na própria linha
        expect(within(linhaDe('007 - Bella Vista')).getByText('006 Condomínios')).toBeInTheDocument();
        expect(within(linhaDe('Manutenção')).getByText('020 Ativos')).toBeInTheDocument();
        // Lançamento legado direto no grupo "Administrativo"
        expect(within(linhaDe('002 Administrativo')).getByText('(lançado no grupo)')).toBeInTheDocument();
    });

    it('abre agrupado pelo grupo: cabeçalho com contagem e soma do realizado, "Sem grupo" no fim', async () => {
        await abrirCentroDeCusto();
        expect(agrupar().value).toBe('grupo');
        const p = posicoes(['002 Administrativo', '006 Condomínios', '010 - Galeria Altavista', '007 - Bella Vista', '020 Ativos', 'Manutenção', 'Sem grupo', '— Sem centro de custo']);
        expect(p.every(x => x > 0)).toBe(true);
        expect(p).toEqual([...p].sort((a, b) => a - b));
        // Cabeçalho do grupo Condomínios: 2 centros, realizado −23.817 (por extenso)
        const cabecalho = screen.getAllByText('006 Condomínios').find(el => el.className.includes('font-semibold'))!;
        const linhaGrupo = within(cabecalho.closest('tr') as HTMLTableRowElement);
        expect(linhaGrupo.getByText('2')).toBeInTheDocument();
        expect(linhaGrupo.getByTitle('Soma do realizado do grupo').textContent).toMatch(/23\.817,00/);
    });

    it('Decrescente inverte a ordem dos grupos; "Sem grupo" continua no fim', async () => {
        await abrirCentroDeCusto();
        fireEvent.change(screen.getByLabelText('Ordem dos grupos'), { target: { value: 'desc' } });
        const p = posicoes(['020 Ativos', '006 Condomínios', '002 Administrativo', '— Sem centro de custo']);
        expect(p).toEqual([...p].sort((a, b) => a - b));
    });

    it('o botão recolhe e expande todos os grupos; o cabeçalho recolhe só o seu', async () => {
        await abrirCentroDeCusto();
        fireEvent.click(screen.getByRole('button', { name: 'Recolher todos os grupos' }));
        expect(screen.queryByText('Manutenção')).not.toBeInTheDocument();
        expect(screen.queryByText('007 - Bella Vista')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expandir todos os grupos' }));
        expect(screen.getByText('Manutenção')).toBeInTheDocument();

        const cabecalhoAtivos = screen.getAllByText('020 Ativos').find(el => el.className.includes('font-semibold'))!;
        fireEvent.click(cabecalhoAtivos);
        expect(screen.queryByText('Manutenção')).not.toBeInTheDocument();
        expect(screen.getByText('007 - Bella Vista')).toBeInTheDocument();
    });

    it('sem agrupamento a lista é plana e o botão fica desligado dizendo o motivo', async () => {
        await abrirCentroDeCusto();
        fireEvent.change(agrupar(), { target: { value: 'none' } });
        expect(screen.queryByTitle('Soma do realizado do grupo')).not.toBeInTheDocument();
        const botao = screen.getByRole('button', { name: 'Recolher todos os grupos' });
        expect(botao).toBeDisabled();
        expect(botao.getAttribute('title')).toMatch(/Agrupar/);
        // A escolha persiste: reabrir não volta a agrupar sozinho
        expect(localStorage.getItem('opuraReports:pivotCc:groupBy')).toContain('none');
    });

    it('clicar na linha do centro abre o extrato dele', async () => {
        await abrirCentroDeCusto();
        fireEvent.click(linhaDe('Manutenção'));
        expect(await screen.findByRole('heading', { name: 'Manutenção' })).toBeInTheDocument();
    });

    it('modo Comparar troca as colunas (Período A/B/Δ/Var.) — a tabela remonta, não herda as do pivot', async () => {
        await abrirCentroDeCusto();
        fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
        await waitFor(() => expect(screen.getByRole('columnheader', { name: /Período A/ })).toBeInTheDocument());
        expect(screen.getByRole('columnheader', { name: /Período B/ })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /Var\./ })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: /Realizado/ })).not.toBeInTheDocument();
        // célula (o rodapé de totais repete o mesmo valor)
        expect(within(linhaDe('Administrativo')).getByText('-R$ 34.482,00')).toBeInTheDocument();
    });

    it('o total do rodapé continua sendo o total da RPC', async () => {
        await abrirCentroDeCusto();
        // Rodapé §6.7/§6.10: `footer` do StandardTable — linha de totais fora do <tbody>
        expect(screen.getByText(/Total · 5 linhas · 734 lançamentos/)).toBeInTheDocument();
    });
});
