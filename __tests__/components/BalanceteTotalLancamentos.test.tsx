// @vitest-environment jsdom
/**
 * Balancete › total de lançamentos com venda parcelada COM JUROS (plano
 * docs/planos/2026-11-10-juros-parcelamento-pendencias.md, item 2).
 *
 * Uma parcela com juros aparece em duas categorias — a da venda (principal) e
 * Receita Financeira (juros) —, e cada linha conta o título (n_transacoes). O
 * total geral somava as duas e mostrava 2 lançamentos para 1 título. Agora a
 * função devolve `n_partes_juros` e a tela desconta essas linhas do total geral;
 * o subtotal do grupo continua por categoria, como a própria linha.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import type { BalanceteLine } from '../../types/financial';

const linhas: BalanceteLine[] = [
    {
        category_id: 'cat-venda', category_name: 'Venda de Imóveis', dre_group: 'RECEITA_BRUTA',
        nature: 'REVENUE', sort_order: 1, creditos: 7884.88, debitos: 0, saldo_liquido: 7884.88,
        n_transacoes: 1, n_partes_juros: 0,
    },
    {
        category_id: 'cat-fin', category_name: 'Receita Financeira', dre_group: 'FINANCEIRO',
        nature: 'REVENUE', sort_order: 7, creditos: 1000, debitos: 0, saldo_liquido: 1000,
        n_transacoes: 1, n_partes_juros: 1,
    },
];

vi.mock('../../services/financialReportService', () => ({
    financialReportService: { getBalancete: vi.fn(() => Promise.resolve(linhas)) },
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn(), localToast: null }) }));

import BalanceteReport from '../../components/BalanceteReport';

describe('Balancete — total de lançamentos com parcela com juros', () => {
    it('conta o título UMA vez no total geral (2 categorias, 1 lançamento)', async () => {
        render(<BalanceteReport organizationId="org-1" />);
        expect(await screen.findByText('2 contas · 1 lançamentos')).toBeTruthy();
    });

    it('linha da Receita Financeira continua mostrando o título que caiu nela', async () => {
        render(<BalanceteReport organizationId="org-1" />);
        const celula = await screen.findByText('Receita Financeira');
        // Última célula = coluna Lançamentos (a linha também tem '1.000,00', que um
        // toContain('1') aceitaria sozinho).
        const celulas = celula.closest('tr')!.querySelectorAll('td');
        expect(celulas[celulas.length - 1].textContent?.trim()).toBe('1');
    });
});
