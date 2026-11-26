// @vitest-environment jsdom
/**
 * Conciliação — descrição do lançamento de contrato (pedido de 26/11/2026, Pendentes e Conciliados):
 * sem "Contrato"/"Aluguel" antes do nº do contrato e sem o código da origem (CONTRACT_RECURRING).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { descricaoDoLancamento } from '../../components/reconciliation/tabelasDaConciliacao';
import ConciliatedTab, { type VinculoDeConciliacao } from '../../components/reconciliation/ConciliatedTab';

describe('descricaoDoLancamento', () => {
    const c = (description: string, source_system = 'CONTRACT_RECURRING') => descricaoDoLancamento({ description, source_system } as never);

    it('tira "Contrato"/"Aluguel" antes do nº do contrato', () => {
        expect(c('Contrato CTL-006-012-0001 — parcela 25/25 (10/04/2019)')).toBe('CTL-006-012-0001 — parcela 25/25 (10/04/2019)');
        expect(c('Aluguel CTL-006-012-0001 (AD-004) — parcela 1/12')).toBe('CTL-006-012-0001 (AD-004) — parcela 1/12');
        expect(c('Contrato CL-010-Sala - 303-0001 — parcela 1/36')).toBe('CL-010-Sala - 303-0001 — parcela 1/36');
    });

    it('não mexe em título sem nº nem em lançamento que não é de contrato', () => {
        expect(c('Contrato: Água — À Vista', 'CONTRACT_AVISTA')).toBe('Contrato: Água — À Vista');
        expect(c('Fatura Contrato CTS-010-036-0001 (1)')).toBe('Fatura Contrato CTS-010-036-0001 (1)');
        expect(c('Contrato CTL-006-012-0001 — parcela 1', 'MANUAL')).toBe('Contrato CTL-006-012-0001 — parcela 1');
    });
});

describe('Conciliados — coluna "Interno: descrição"', () => {
    beforeEach(() => localStorage.clear());

    const vinculo = (source_system: string, description: string): VinculoDeConciliacao => ({
        id: `m-${source_system}`, bank_transaction_id: 'b1', internal_transaction_id: `i-${source_system}`, created_at: '2019-04-10',
        bank_transaction: { id: 'b1', direction: 'CREDIT', amount: 4338.43, transaction_date: '2019-04-05', description_raw: 'TED 237 IGREJA', category: null } as never,
        internal_transaction: { id: `i-${source_system}`, direction: 'CREDIT', amount: 4784.92, transaction_date: '2019-04-10', description, source_system, category: 'Receita de Obra' } as never,
    });

    const renderLista = (matches: VinculoDeConciliacao[]) => render(
        <ConciliatedTab
            matches={matches} sortedMatches={matches} conciliatedViewMode="list" setConciliatedViewMode={() => {}}
            matchSortOrder="desc" setMatchSortOrder={() => {}} onUndoMatch={() => {}}
        />,
    );

    it('contrato: começa pelo nº e sem CONTRACT_RECURRING; outra origem segue com o código', () => {
        renderLista([vinculo('CONTRACT_RECURRING', 'Contrato CTL-006-012-0001 — parcela 25/25 (10/04/2019)'), vinculo('BOLETO', 'Energia abril')]);
        expect(screen.getByText('CTL-006-012-0001 — parcela 25/25 (10/04/2019)')).toBeTruthy();
        expect(screen.queryByText(/^Contrato CTL/)).toBeNull();
        expect(screen.queryByText('CONTRACT_RECURRING')).toBeNull();
        expect(screen.getByText('BOLETO')).toBeTruthy();
    });

    it('sem dropdown de categoria e sem "Vinculado" empilhado no valor', () => {
        renderLista([vinculo('CONTRACT_RECURRING', 'Contrato CTL-006-012-0001 — parcela 25/25 (10/04/2019)')]);
        expect(screen.queryByText('Receita de Obra')).toBeNull();
        expect(screen.queryByText('Pendente')).toBeNull();
        expect(screen.queryByText('Vinculado')).toBeNull();
        expect(screen.getByRole('img', { name: 'Vinculado' })).toBeTruthy();
    });

    it('cabeçalho em dois níveis diz o que é do Extrato e o que é dos Lançamentos', () => {
        renderLista([vinculo('CONTRACT_RECURRING', 'Contrato CTL-006-012-0001 — parcela 1')]);
        const grupos = screen.getAllByRole('columnheader').filter(th => th.getAttribute('scope') === 'colgroup');
        expect(grupos.map(th => [th.textContent, th.getAttribute('colspan')])).toEqual([['Extrato', '3'], ['Lançamentos', '3']]);
    });
});
