// @vitest-environment jsdom
/**
 * Central de Conciliação em tabela (11/10/2026).
 *
 * Pedido: "inves de cards com informações empilhadas dificultando visualizacao, seria
 * melhor em formato de tabela padrão ao nosso app" + "faca os 3" — (1) ver os candidatos
 * alternativos, (2) busca/ordenação, (3) conciliar em lote.
 * Plano: docs/planos/2026-10-11-conciliacao-central-sugestoes-em-tabela.md
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../services/bankReconciliationService', () => ({
    bankReconciliationService: {
        ultimaExecucao: vi.fn(async () => null),
        resolverOrganizacaoDaConta: vi.fn(async () => 'org-1'),
        listarRegras: vi.fn(async () => []),
    },
}));
vi.mock('../../services/reconciliationMemoryService', () => ({
    reconciliationMemoryService: { candidatasARegra: vi.fn(async () => []) },
}));
vi.mock('../../services/reconciliationReprocessService', () => ({
    reconciliationReprocessService: { reprocessarTudo: vi.fn() },
    resumoDoReprocesso: () => '',
}));
vi.mock('../../components/GroupMatchPanel', () => ({ default: () => null }));
vi.mock('../../components/reconciliation/RegrasSheet', () => ({ default: () => null }));

import SmartReconciliationCenter, { separarTitulosRepetidos } from '../../components/SmartReconciliationCenter';

const titulo = (id: string, descricao: string, venc: string) => ({
    id, description: descricao, amount: 4556, valor_esperado: 4167.03,
    party_name: 'Igreja Universal do Reino de Deus', party_type: 'CLIENT', due_date: venc, transaction_date: venc,
});
const sug = (id: string, bankId: string, t: ReturnType<typeof titulo>, confidence: number) => ({
    id, bank_transaction_id: bankId, candidate_internal_transaction_id: t.id, confidence,
    reason: 'Valor exato · Data dentro de 4d · Mesmo fornecedor (alta similaridade)',
    candidate_internal_transaction: t,
});

const MAR17 = titulo('t-mar17', 'Contrato CTL-006-012-0001 — parcela 5/30', '2017-03-10');
const ABR17 = titulo('t-abr17', 'Contrato CTL-006-012-0001 — parcela 6/30', '2017-04-10');
const MAR18 = titulo('t-mar18', 'Contrato CTL-006-012-0001 — parcela 17/30', '2018-03-10');

const extratos = [
    { id: 'b-mar17', transaction_date: '2017-03-06', amount: 4167.03, direction: 'CREDIT' as const, counterparty_name: 'Igreja Universal do Reino de Deus', description_raw: 'TED 237 3396IGREJA UNIV' },
    { id: 'b-mar18', transaction_date: '2018-03-06', amount: 4167.03, direction: 'CREDIT' as const, counterparty_name: 'Igreja Universal do Reino de Deus', description_raw: 'TED 237 3396IGREJA UNIV' },
];

const montar = (sugestoes: ReturnType<typeof sug>[], onConfirm = vi.fn(async () => {})) => {
    localStorage.clear();
    render(
        <SmartReconciliationCenter
            organizationId="org-1"
            selectedAccountId="conta-1"
            suggestions={sugestoes}
            bankTransactions={extratos}
            onConfirm={onConfirm}
            onReject={vi.fn()}
            onReload={vi.fn()}
            categories={[]}
            clienteRegistros={[]}
            credorRegistros={[]}
        />,
    );
    return onConfirm;
};

describe('Central de Conciliação — tabela', () => {
    beforeEach(() => { localStorage.clear(); });

    it('uma linha por movimento, com valor do extrato, confiança e valor previsto lado a lado', () => {
        montar([sug('s1', 'b-mar17', MAR17, 78), sug('s2', 'b-mar17', ABR17, 70), sug('s3', 'b-mar18', MAR18, 78)]);
        const tabela = screen.getByRole('table');
        const cabecalho = within(tabela).getAllByRole('columnheader').map(th => th.textContent?.trim()).filter(Boolean);
        expect(cabecalho.slice(0, 5)).toEqual(['Data', 'Extrato', 'Valor', 'Confiança', 'Valor previsto']);
        // 2 movimentos = 2 linhas de dado (+ cabeçalho)
        expect(within(tabela).getAllByRole('row')).toHaveLength(3);
        expect(screen.getByText('Contrato CTL-006-012-0001 — parcela 5/30')).toBeTruthy();
        // o alternativo NÃO aparece até ser pedido
        expect(screen.queryByText('Contrato CTL-006-012-0001 — parcela 6/30')).toBeNull();
    });

    it('(1) "+1" abre o candidato alternativo, e o Conciliar dele usa o título alternativo', async () => {
        const onConfirm = montar([sug('s1', 'b-mar17', MAR17, 78), sug('s2', 'b-mar17', ABR17, 70)]);
        fireEvent.click(screen.getByRole('button', { name: '· +1' }));
        const alternativo = screen.getByText('Contrato CTL-006-012-0001 — parcela 6/30').closest('tr')!;
        fireEvent.click(within(alternativo).getByRole('button', { name: 'Conciliar' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('b-mar17', 't-abr17'));
    });

    it('(2) a busca recorta as linhas', () => {
        montar([sug('s1', 'b-mar17', MAR17, 78), sug('s3', 'b-mar18', MAR18, 78)]);
        fireEvent.change(screen.getByPlaceholderText(/Buscar por contraparte/), { target: { value: 'parcela 17' } });
        expect(screen.queryByText('Contrato CTL-006-012-0001 — parcela 5/30')).toBeNull();
        expect(screen.getByText('Contrato CTL-006-012-0001 — parcela 17/30')).toBeTruthy();
    });

    it('(3) selecionar dois movimentos e conciliar em lote chama um vínculo por movimento', async () => {
        const onConfirm = montar([sug('s1', 'b-mar17', MAR17, 78), sug('s3', 'b-mar18', MAR18, 78)]);
        const [todos] = screen.getAllByRole('checkbox');
        fireEvent.click(todos);
        expect(screen.getByText(/2 selecionados/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Conciliar selecionados/ }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
        expect(onConfirm).toHaveBeenCalledWith('b-mar17', 't-mar17');
        expect(onConfirm).toHaveBeenCalledWith('b-mar18', 't-mar18');
    });

    it('(3) linha escondida pela busca sai da seleção — o lote nunca age sobre o que não se vê', async () => {
        const onConfirm = montar([sug('s1', 'b-mar17', MAR17, 78), sug('s3', 'b-mar18', MAR18, 78)]);
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        expect(screen.getByText(/2 selecionados/)).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText(/Buscar por contraparte/), { target: { value: 'parcela 17' } });
        expect(await screen.findByText(/1 selecionado\b/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Conciliar selecionados/ }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(onConfirm).toHaveBeenCalledWith('b-mar18', 't-mar18');
    });

    it('(3) dois movimentos apontando para o MESMO título: só o primeiro vai', async () => {
        const onConfirm = montar([sug('s1', 'b-mar17', MAR17, 78), sug('s3', 'b-mar18', MAR17, 60)]);
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        fireEvent.click(screen.getByRole('button', { name: /Conciliar selecionados/ }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(await screen.findByText(/ficou\(aram\) de fora/)).toBeTruthy();
    });
});

describe('separarTitulosRepetidos', () => {
    it('mantém a ordem e tira o segundo uso do mesmo título', () => {
        const a = { id: 'a', sug: { candidate_internal_transaction_id: 't1' } };
        const b = { id: 'b', sug: { candidate_internal_transaction_id: 't2' } };
        const c = { id: 'c', sug: { candidate_internal_transaction_id: 't1' } };
        const { aConciliar, repetidos } = separarTitulosRepetidos([a, b, c]);
        expect(aConciliar.map(x => x.id)).toEqual(['a', 'b']);
        expect(repetidos.map(x => x.id)).toEqual(['c']);
    });
});
