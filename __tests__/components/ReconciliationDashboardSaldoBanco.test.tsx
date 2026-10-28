// @vitest-environment jsdom
/**
 * Conciliação › Dashboard, passo 2 (docs/planos/2026-10-28-conciliacao-dashboard-confianca.md):
 * o saldo que o banco informa ao lado do calculado, o ajuste do saldo inicial pelas duas
 * saídas que o usuário escolheu, e a ação em cada número que preocupa.
 * Os números são os de produção em 28/10/2026.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const servico = vi.hoisted(() => ({
    getDashboard: vi.fn(),
    getConsolidated: vi.fn(),
    setOpeningBalance: vi.fn(),
    informarSaldoDoBanco: vi.fn(),
}));
vi.mock('../../services/reconciliationDashboardService', () => ({ reconciliationDashboardService: servico }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import ReconciliationDashboardView from '../../components/ReconciliationDashboard';
import type { ReconciliationAccountBalance, ReconciliationDashboard } from '../../types/financial';

const base = (extra: Partial<ReconciliationAccountBalance>): ReconciliationAccountBalance => ({
    account_id: 'x', account_name: 'x', bank_name: null, opening_balance: 0, opening_balance_date: null,
    bank_balance: 0, reconciled_balance: 0, difference: 0, pending_value: 0, pending_count: 0, unclassified_count: 0,
    saldo_banco: null, saldo_banco_data: null, saldo_banco_origem: null, calculado_na_data_banco: null, pendentes_apos_data_banco: null,
    ...extra,
});

const itau = base({
    account_id: 'itau', account_name: 'Banco Itaú', bank_balance: 10850187.26, pending_count: 7516, unclassified_count: 6000,
    saldo_banco: -39048.13, saldo_banco_data: '2026-09-14', saldo_banco_origem: 'OFX',
    calculado_na_data_banco: 10850187.26, pendentes_apos_data_banco: 0,
});
const asaas = base({
    account_id: 'asaas', account_name: 'Asaas', bank_balance: 138.35, pending_count: 3,
    saldo_banco: 138.35, saldo_banco_data: '2026-10-28', saldo_banco_origem: 'ASAAS', calculado_na_data_banco: 138.35, pendentes_apos_data_banco: 3,
});
const sicredi = base({ account_id: 'sicredi', account_name: 'Sicredi', bank_balance: -41405.7, pending_count: 5329, unclassified_count: 50 });

const dashboard = (contas = [asaas, itau, sicredi], fees = { value: 6697.37, count: 99 }): ReconciliationDashboard => ({
    as_of: '2026-10-28',
    accounts: contas,
    totals: {
        opening_balance: 0, bank_balance: 0, reconciled_balance: 0, difference: 1000,
        pending_value: 0, pending_count: contas.reduce((s, c) => s + c.pending_count, 0),
        unclassified_count: contas.reduce((s, c) => s + c.unclassified_count, 0),
    },
    system_balance: 0,
    fees,
});

beforeEach(() => {
    servico.getDashboard.mockReset().mockResolvedValue(dashboard());
    servico.getConsolidated.mockReset().mockResolvedValue({
        as_of: '2026-10-28', totals: { bank_balance: 0, reconciled_balance: 0, pending_value: 0, account_count: 0, empresa_count: 0 },
        by_empresa: [], by_project: [],
    });
    servico.setOpeningBalance.mockReset().mockResolvedValue(undefined);
    servico.informarSaldoDoBanco.mockReset().mockResolvedValue(undefined);
});

const linhaDa = async (conta: string) => (await screen.findByText(conta, { selector: 'td p' })).closest('tr') as HTMLElement;

describe('Dashboard — saldo no banco', () => {
    it('responde "bate?" nomeando as contas de cada estado', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        const resumo = await screen.findByText(/de 3 contas batem com o banco/);
        expect(resumo).toHaveTextContent('1 de 3 contas batem com o banco');
        expect(screen.getByText(/Não bate: Banco Itaú/)).toBeInTheDocument();
        expect(screen.getByText(/O banco não informou o saldo de: Sicredi/)).toBeInTheDocument();
    });

    it('cada linha mostra o seu estado: bate, fora (com o calculado) e sem saldo', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        const lAsaas = await linhaDa('Asaas');
        expect(within(lAsaas).getByText('bate')).toBeInTheDocument();
        expect(within(lAsaas).getByText(/em 28\/10\/2026 · Asaas/)).toBeInTheDocument();

        const lItau = await linhaDa('Banco Itaú');
        expect(within(lItau).getByText(/em 14\/09\/2026 · OFX/)).toBeInTheDocument();
        expect(within(lItau).getByText(/app calcula/)).toHaveTextContent(/10\.850\.187,26/);
        expect(within(lItau).getByRole('button', { name: /Ajustar/ })).toBeInTheDocument();

        const lSicredi = await linhaDa('Sicredi');
        expect(within(lSicredi).getByRole('button', { name: 'Informar saldo do extrato' })).toBeInTheDocument();
    });

    it('Ajustar: recomeçar no saldo do banco grava o saldo do banco a partir do dia seguinte', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        fireEvent.click(within(await linhaDa('Banco Itaú')).getByRole('button', { name: /Ajustar/ }));
        expect(await screen.findByText(/7\.516 pendentes deixam de contar/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldo inicial' }));
        await waitFor(() => expect(servico.setOpeningBalance).toHaveBeenCalledWith('itau', -39048.13, '2026-09-15'));
    });

    it('Ajustar: manter a data grava o valor que fecha, com todo o extrato', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        fireEvent.click(within(await linhaDa('Banco Itaú')).getByRole('button', { name: /Ajustar/ }));
        fireEvent.click(await screen.findByRole('radio', { name: /Manter a data de início/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldo inicial' }));
        await waitFor(() => expect(servico.setOpeningBalance).toHaveBeenCalledWith('itau', -10889235.39, null));
    });

    it('Informar saldo do extrato grava data e valor da conta', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        fireEvent.click(within(await linhaDa('Sicredi')).getByRole('button', { name: 'Informar saldo do extrato' }));
        fireEvent.change(await screen.findByLabelText('Data do saldo'), { target: { value: '2026-09-30' } });
        fireEvent.change(screen.getByLabelText('Saldo no extrato'), { target: { value: '-1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'Gravar saldo' }));
        await waitFor(() => expect(servico.informarSaldoDoBanco).toHaveBeenCalledWith('sicredi', '2026-09-30', -12345.67));
    });
});

describe('Dashboard — ação em cada número', () => {
    it('cada número que preocupa leva à aba onde se resolve, na conta certa', async () => {
        const onIrPara = vi.fn();
        render(<ReconciliationDashboardView organizationId={null} onIrPara={onIrPara} />);

        fireEvent.click(await screen.findByRole('button', { name: /Conciliar Banco Itaú na Central/ }));
        expect(onIrPara).toHaveBeenLastCalledWith({ aba: 'center', contaId: 'itau' });

        fireEvent.click(screen.getByRole('button', { name: /Classificar Banco Itaú em Pendentes/ }));
        expect(onIrPara).toHaveBeenLastCalledWith({ aba: 'pending', contaId: 'itau', recorte: 'sem-classificacao' });

        fireEvent.click(screen.getByRole('button', { name: /Ver tarifas em Pendentes/ }));
        expect(onIrPara).toHaveBeenLastCalledWith({ aba: 'pending', contaId: 'itau', recorte: 'tarifas' });

        fireEvent.click(screen.getByRole('button', { name: /Criar regra/ }));
        expect(onIrPara).toHaveBeenLastCalledWith({ aba: 'center', contaId: 'itau', regra: 'tarifas' });

        fireEvent.click(screen.getByRole('button', { name: 'Conciliar Sicredi em Pendentes' }));
        expect(onIrPara).toHaveBeenLastCalledWith({ aba: 'pending', contaId: 'sicredi' });
    });

    it('número que não preocupa não ganha ação', async () => {
        servico.getDashboard.mockResolvedValue(dashboard([base({ account_id: 'ok', account_name: 'Conta em dia' })], { value: 0, count: 0 }));
        render(<ReconciliationDashboardView organizationId={null} onIrPara={vi.fn()} />);
        await linhaDa('Conta em dia');
        expect(screen.queryByRole('button', { name: /Conciliar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /tarifas/ })).toBeNull();
    });

    it('fora da Conciliação (sem onIrPara) nenhum número vira link', async () => {
        render(<ReconciliationDashboardView organizationId={null} />);
        await linhaDa('Banco Itaú');
        expect(screen.queryByRole('button', { name: /na Central/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Conciliar Sicredi/ })).toBeNull();
    });
});
