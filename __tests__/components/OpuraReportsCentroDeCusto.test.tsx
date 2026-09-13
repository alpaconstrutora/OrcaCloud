// @vitest-environment jsdom
/**
 * ÒPURA · Relatórios › dimensão "Centro de Custo" — a tabela espelha a
 * hierarquia de Organização › Centro de Custo (grupo → centros), com os
 * totais somados no grupo e chevron para recolher.
 * Pedido de 13/09/2026, docs/planos/2026-09-13-relatorios-centro-de-custo-grupos.md
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
    await waitFor(() => expect(screen.getByText('Condomínios')).toBeInTheDocument());
}

const linhaDe = (texto: string) => screen.getByText(texto).closest('tr') as HTMLTableRowElement;

describe('ÒPURA · Relatórios › Centro de Custo em grupos', () => {
    // Filtros/abas/modo persistem em localStorage (§3): cada teste parte limpo.
    beforeEach(() => localStorage.clear());

    it('lista grupo → centros na ordem do cadastro, com os filhos indentados e o grupo somando', async () => {
        await abrirCentroDeCusto();
        const rotulos = screen.getAllByRole('row').map(r => r.textContent ?? '');
        const ordem = ['Administrativo', 'Condomínios', '010 - Galeria Altavista', '007 - Bella Vista', 'Ativos', 'Manutenção', '— Sem centro de custo'];
        const posicoes = ordem.map(t => rotulos.findIndex(r => r.includes(t)));
        expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
        expect(posicoes.every(p => p > 0)).toBe(true);

        // Grupo "Condomínios" soma os filhos: 50 + 12 lançamentos, realizado −23.817
        const cond = within(linhaDe('Condomínios'));
        expect(cond.getByText('62')).toBeInTheDocument();
        expect(cond.getByText('-R$ 23.817,00')).toBeInTheDocument(); // por extenso, nunca abreviado
        // "Obra" (001) não tem lançamento no período: fica de fora da tabela
        expect(rotulos.some(r => r.startsWith('001Obra'))).toBe(false);
    });

    it('clicar no grupo recolhe os filhos; clicar de novo expande', async () => {
        await abrirCentroDeCusto();
        expect(screen.getByText('Manutenção')).toBeInTheDocument();
        fireEvent.click(linhaDe('Ativos'));
        expect(screen.queryByText('Manutenção')).not.toBeInTheDocument();
        fireEvent.click(linhaDe('Ativos'));
        expect(screen.getByText('Manutenção')).toBeInTheDocument();
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

    it('o total do rodapé continua sendo o total plano (não conta grupo duas vezes)', async () => {
        await abrirCentroDeCusto();
        // Rodapé §6.7/§6.10: `footer` do StandardTable — linha de totais fora do <tbody>
        expect(screen.getByText(/Total · 5 linhas · 734 lançamentos/)).toBeInTheDocument();
    });
});
