// @vitest-environment jsdom
/**
 * Conciliação › aba Dashboard — o que a crítica de 28/10/2026 achou e não pode voltar
 * (docs/planos/2026-10-28-conciliacao-dashboard-confianca.md, passo 1):
 *
 *  - editar o saldo inicial lia "1.234,56" como 1,234 e gravava a data de início como NULL
 *    a cada salvamento, sem confirmação;
 *  - carregando ou com erro, a tela mostrava R$ 0,00 como se fosse o saldo do banco.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const servico = vi.hoisted(() => ({
    getDashboard: vi.fn(),
    getConsolidated: vi.fn(),
    setOpeningBalance: vi.fn(),
}));
vi.mock('../../services/reconciliationDashboardService', () => ({ reconciliationDashboardService: servico }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const confirmar = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));

import ReconciliationDashboardView from '../../components/ReconciliationDashboard';
import type { ReconciliationAccountBalance, ReconciliationDashboard } from '../../types/financial';

const conta = (extra: Partial<ReconciliationAccountBalance> = {}): ReconciliationAccountBalance => ({
    account_id: 'a1', account_name: 'Itaú', bank_name: 'Banco Itaú',
    opening_balance: 0, opening_balance_date: '2026-01-01',
    bank_balance: 1000, reconciled_balance: 400, difference: 600,
    pending_value: 600, pending_count: 3, unclassified_count: 0,
    ...extra,
});

const dashboard = (c = conta()): ReconciliationDashboard => ({
    as_of: '2026-10-28',
    accounts: [c],
    totals: {
        opening_balance: c.opening_balance, bank_balance: c.bank_balance, reconciled_balance: c.reconciled_balance,
        difference: c.difference, pending_value: c.pending_value, pending_count: c.pending_count, unclassified_count: 0,
    },
    system_balance: 400,
    fees: { value: 0, count: 0 },
});

const consolidado = {
    as_of: '2026-10-28',
    totals: { bank_balance: 0, reconciled_balance: 0, pending_value: 0, account_count: 0, empresa_count: 0 },
    by_empresa: [], by_project: [],
};

beforeEach(() => {
    servico.getDashboard.mockReset();
    servico.getConsolidated.mockReset().mockResolvedValue(consolidado);
    servico.setOpeningBalance.mockReset().mockResolvedValue(undefined);
    confirmar.mockReset().mockResolvedValue(true);
});

async function abrirEdicao(c = conta()) {
    servico.getDashboard.mockResolvedValue(dashboard(c));
    render(<ReconciliationDashboardView organizationId="org1" />);
    fireEvent.click(await screen.findByRole('button', { name: `Editar saldo inicial de ${c.account_name}` }));
    return screen.getByLabelText(`Saldo inicial de ${c.account_name}`);
}

describe('ReconciliationDashboard — estados de carga', () => {
    it('enquanto carrega pela primeira vez não mostra número nenhum', () => {
        servico.getDashboard.mockReturnValue(new Promise(() => {}));
        render(<ReconciliationDashboardView organizationId="org1" />);
        expect(screen.getByText('Carregando a conciliação…')).toBeInTheDocument();
        expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
    });

    it('falhou: diz o que falhou, não mostra R$ 0,00, e "Tentar de novo" recarrega', async () => {
        servico.getDashboard.mockRejectedValueOnce(new Error('Acesso negado')).mockResolvedValue(dashboard());
        render(<ReconciliationDashboardView organizationId="org1" />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível carregar a posição em/);
        expect(screen.getByRole('alert')).toHaveTextContent('Acesso negado');
        expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
        expect(await screen.findByText('Itaú')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(servico.getDashboard).toHaveBeenCalledTimes(2);
    });
});

describe('ReconciliationDashboard — saldo inicial', () => {
    it('digitar 123456 grava R$ 1.234,56 e MANTÉM a data de início, depois de confirmar', async () => {
        const campo = await abrirEdicao();
        fireEvent.change(campo, { target: { value: '123456' } });
        fireEvent.keyDown(campo, { key: 'Enter' });

        await waitFor(() => expect(servico.setOpeningBalance).toHaveBeenCalledWith('a1', 1234.56, '2026-01-01'));
        expect(confirmar).toHaveBeenCalledTimes(1);
        const { message } = confirmar.mock.calls[0][0] as { message: React.ReactNode };
        const { container } = render(<>{message}</>);
        expect(container).toHaveTextContent(/1\.234,56/);
    });

    it('saldo negativo é aceito', async () => {
        const campo = await abrirEdicao();
        fireEvent.change(campo, { target: { value: '-5000' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        await waitFor(() => expect(servico.setOpeningBalance).toHaveBeenCalledWith('a1', -50, '2026-01-01'));
    });

    it('Esc cancela sem gravar e sem perguntar', async () => {
        const campo = await abrirEdicao();
        fireEvent.change(campo, { target: { value: '999' } });
        fireEvent.keyDown(campo, { key: 'Escape' });
        expect(screen.queryByLabelText('Saldo inicial de Itaú')).toBeNull();
        expect(confirmar).not.toHaveBeenCalled();
        expect(servico.setOpeningBalance).not.toHaveBeenCalled();
    });

    it('não confirmou: não grava', async () => {
        // Como o modal de verdade: ele tira o foco do campo enquanto está aberto.
        confirmar.mockImplementation(async () => { (document.activeElement as HTMLElement | null)?.blur(); return false; });
        const campo = await abrirEdicao();
        fireEvent.change(campo, { target: { value: '100' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        await waitFor(() => expect(confirmar).toHaveBeenCalled());
        expect(servico.setOpeningBalance).not.toHaveBeenCalled();
        // Fechar a confirmação devolve o foco ao campo — senão o Esc não sai da edição
        // (visto em produção em 28/10/2026).
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Saldo inicial de Itaú')));
        fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
        expect(screen.queryByLabelText('Saldo inicial de Itaú')).toBeNull();
    });

    it('banco ainda sem a data no retorno: grava o saldo e NÃO apaga a data', async () => {
        const semData = conta();
        delete semData.opening_balance_date;
        const campo = await abrirEdicao(semData);
        fireEvent.change(campo, { target: { value: '100' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        await waitFor(() => expect(servico.setOpeningBalance).toHaveBeenCalledWith('a1', 1, undefined));
    });
});
