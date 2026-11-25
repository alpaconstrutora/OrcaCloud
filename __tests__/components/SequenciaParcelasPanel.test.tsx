// @vitest-environment jsdom
/**
 * Conciliação › Central › Sequência de parcelas (pedido de 24/11/2026): o card lista só
 * contratos cuja série quebrou, com as ocorrências em texto colorido (§8), e o
 * "Conciliar juntas" chama a conciliação agrupada com as parcelas seguidas.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { analisarSequencias, acharPagamentosJuntos, acharCreditosParecidos, type ParcelaDeContrato } from '../../utils/sequenciaParcelas';

const { carregar, conciliarJuntas } = vi.hoisted(() => ({ carregar: vi.fn(), conciliarJuntas: vi.fn() }));
vi.mock('../../services/sequenciaParcelasService', () => ({
    sequenciaParcelasService: { carregar, conciliarJuntas },
}));

import SequenciaParcelasPanel from '../../components/reconciliation/SequenciaParcelasPanel';
import { ConfirmProvider } from '../../components/ui/confirm';

const CONTA = 'conta-1';
const p = (contrato: string, mes: string, over: Partial<ParcelaDeContrato> = {}): ParcelaDeContrato => ({
    id: `${contrato}-${mes}`, contract_id: contrato, due_date: `${mes}-10`, amount: 1000, direction: 'CREDIT',
    status: 'PENDING', business_status: 'PREVISTO', bank_reconciled_at: null, payment_date: null, reference_id: null,
    party_name: contrato === 'c1' ? 'Fulano de Tal Souza' : 'Beltrano Pereira', entity_name: null,
    contrato: { number: contrato === 'c1' ? 'CTL-001' : 'CTL-002', title: 'Aluguel', domain: 'LOCACAO', payment_account_id: null },
    vinculos: [], ...over,
});
const paga = (contrato: string, mes: string, data: string) => p(contrato, mes, {
    status: 'CONCILIATED', bank_reconciled_at: `${data}T12:00:00Z`,
    vinculos: [{ bank_transaction_id: `b-${contrato}-${mes}`, data, bank_account_id: CONTA }],
});

function dados() {
    const opcoes = { hoje: '2026-11-24', primeiroExtrato: '2026-01-01', ultimoExtrato: '2026-10-31', contaId: CONTA };
    const series = analisarSequencias([
        // c1: fevereiro e março abertos entre parcelas pagas (2 furos); o crédito de 2.000
        // de abril casa com as parcelas 2 + 3.
        paga('c1', '2026-01', '2026-01-10'), p('c1', '2026-02'), p('c1', '2026-03'), paga('c1', '2026-04', '2026-04-10'),
        // c2: tudo em dia até março, que venceu em aberto; há um crédito de 1.041 (reajuste?)
        // do mesmo cliente perto do vencimento.
        paga('c2', '2026-01', '2026-01-10'), paga('c2', '2026-02', '2026-02-10'), p('c2', '2026-03'),
    ], opcoes);
    const extrato = [
        { id: 'bx', transaction_date: '2026-04-20', amount: 2000, direction: 'CREDIT' as const, description_normalized: 'PIX FULANO DE TAL', counterparty_name: null },
        { id: 'by', transaction_date: '2026-03-06', amount: 1041, direction: 'CREDIT' as const, description_normalized: 'TED 237 BELTRANO PEREIRA', counterparty_name: null },
    ];
    const candidatos = acharPagamentosJuntos(series, extrato);
    const parecidos = acharCreditosParecidos(series, extrato, candidatos.map(c => c.bank.id));
    return { series, candidatos, parecidos, primeiroExtrato: opcoes.primeiroExtrato, ultimoExtrato: opcoes.ultimoExtrato };
}

const renderizar = (onReload = vi.fn()) => render(
    <ConfirmProvider><SequenciaParcelasPanel organizationId="org" selectedAccountId={CONTA} onReload={onReload} /></ConfirmProvider>,
);

describe('SequenciaParcelasPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        // Os casos abaixo olham o conteúdo: seção já aberta (o padrão recolhido tem teste próprio).
        localStorage.setItem('conciliacao:secao:sequencia-parcelas:aberta', 'true');
        carregar.mockReset().mockResolvedValue(dados());
        conciliarJuntas.mockReset().mockResolvedValue(undefined);
    });

    it('lista os contratos com ocorrência, com o furo em texto', async () => {
        renderizar();
        expect(await screen.findByText('CTL-001 · Aluguel')).toBeTruthy();
        expect(screen.getByText('2 furos')).toBeTruthy();
        expect(screen.getByText(/2 contratos com ocorrência/)).toBeTruthy();
        expect(carregar).toHaveBeenCalledWith(CONTA, 'org');
    });

    it('"Conciliar juntas" concilia as parcelas seguidas e recarrega a Central', async () => {
        const onReload = vi.fn();
        renderizar(onReload);
        expect(await screen.findByText(/= parcelas 2 e 3/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Conciliar juntas/ }));
        await waitFor(() => expect(conciliarJuntas).toHaveBeenCalledTimes(1));
        expect(conciliarJuntas.mock.calls[0][0].parcelas.map((x: { id: string }) => x.id)).toEqual(['c1-2026-02', 'c1-2026-03']);
        await waitFor(() => expect(onReload).toHaveBeenCalled());
        expect(carregar).toHaveBeenCalledTimes(2);
    });

    it('clicar no contrato abre a série inteira na gaveta', async () => {
        renderizar();
        fireEvent.click(await screen.findByText('CTL-001 · Aluguel'));
        expect(await screen.findByText('2 de 4 parcelas conferidas no extrato')).toBeTruthy();
        expect(screen.getAllByText('Furo — não paga')).toHaveLength(2);
    });

    it('contrato em dia não aparece', async () => {
        const d = dados();
        carregar.mockReset().mockResolvedValue({ ...d, series: d.series.filter(s => s.contractId === 'c1') });
        renderizar();
        expect(await screen.findByText('CTL-001 · Aluguel')).toBeTruthy();
        expect(screen.queryByText('CTL-002 · Aluguel')).toBeNull();
    });

    it('parcela vencida com movimento parecido no extrato avisa no card e na gaveta', async () => {
        renderizar();
        expect(await screen.findByText('1 com movimento parecido')).toBeTruthy();
        fireEvent.click(screen.getByText('CTL-002 · Aluguel'));
        expect(await screen.findByText(/Crédito pendente de 06\/03\/2026 · R\$\s?1\.041,00 \(\+4,1%\) pode ser esta parcela/)).toBeTruthy();
    });

    it('"Ocultar conciliadas" na gaveta esconde as conferidas e fica lembrado', async () => {
        renderizar();
        fireEvent.click(await screen.findByText('CTL-001 · Aluguel'));
        await screen.findByText('2 de 4 parcelas conferidas no extrato');
        expect(screen.getAllByText('Conferida')).toHaveLength(2);
        fireEvent.click(screen.getByRole('checkbox', { name: /Ocultar conciliadas \(2\)/ }));
        expect(screen.queryAllByText('Conferida')).toHaveLength(0);
        expect(screen.getAllByText('Furo — não paga')).toHaveLength(2);
        expect(localStorage.getItem('conciliacao:sequencia:ocultarConciliadas')).toBe('true');
    });

    it('acima da tabela: nasce RECOLHIDA, uma linha com a contagem; o clique abre e fica lembrado', async () => {
        localStorage.clear();
        renderizar();
        const titulo = await screen.findByRole('button', { name: /Sequência de parcelas.*2 contratos com ocorrência/ });
        expect(titulo.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByText('CTL-001 · Aluguel')).toBeNull();
        fireEvent.click(titulo);
        expect(await screen.findByText('CTL-001 · Aluguel')).toBeTruthy();
        expect(localStorage.getItem('conciliacao:secao:sequencia-parcelas:aberta')).toBe('true');
    });

    it('sem contrato com ocorrência, a seção nem aparece', async () => {
        carregar.mockReset().mockResolvedValue({ ...dados(), series: [], candidatos: [], parecidos: new Map() });
        const { container } = renderizar();
        await waitFor(() => expect(carregar).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByText(/calculando/)).toBeNull());
        expect(container.textContent).not.toContain('Sequência de parcelas');
    });

    it('erro de leitura aparece no card', async () => {
        carregar.mockReset().mockRejectedValue(new Error('falhou'));
        renderizar();
        expect(await screen.findByText(/Não foi possível ler a sequência de parcelas: falhou/)).toBeTruthy();
    });
});
