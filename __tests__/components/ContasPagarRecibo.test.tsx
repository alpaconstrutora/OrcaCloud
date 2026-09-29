// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas — baixa com painel e recibo de pagamento (o credor
 * assina). Plano: docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md
 *
 * O que o typecheck não pega: o "Pago" abrir o painel (e não baixar direto),
 * o recibo sair como PAGAMENTO (a RPC de recebimento recusaria o título), Boleto
 * vir desmarcado, Folha não ter recibo, e o estorno tirar o número da coluna.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Payable } from '../../types/financial';

const svc = vi.hoisted(() => ({
    darBaixa: vi.fn(async () => {}),
    updateStatus: vi.fn(async () => {}),
    baixarPdf: vi.fn(async (id: string) => ({ recibo: { id: `r-${id}`, transaction_id: id, receipt_number: 1 }, guardado: true })),
    listarAtivosDaOrg: vi.fn(async () => new Map()),
}));

vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: { listCostCenters: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) },
}));
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => []) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/appSettingsService', () => ({
    appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }) },
}));
vi.mock('../../services/propertyExpenseService', () => ({
    propertyExpenseService: { allocationSummary: vi.fn(async () => new Map()) },
}));
vi.mock('../../services/payableService', () => ({
    payableService: { updateStatus: svc.updateStatus, remove: vi.fn(), darBaixa: svc.darBaixa },
    payableParty: (p: { party_name?: string; entity_name?: string }) => p.party_name || p.entity_name || '—',
}));
vi.mock('../../services/financialReceiptService', () => ({
    financialReceiptService: { listarAtivosDaOrg: svc.listarAtivosDaOrg, baixarPdf: svc.baixarPdf },
}));
vi.mock('../../components/financeiro/ApropriarImovelSheet', () => ({ default: () => null }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import ContasPagarParcelas from '../../components/ContasPagarParcelas';

const linha = (over: Partial<Payable>): Payable => ({
    id: 'x', organization_id: 'org1', source_system: 'CONTRACT_PARCELADO', reference_id: null,
    transaction_date: '2026-10-01', due_date: '2026-10-10', amount: 1000, direction: 'DEBIT',
    description: 'linha', category: null, status: 'PENDING', business_status: 'PREVISTO',
    effective_status: 'PREVISTO', party_id: null, party_name: 'Fornecedor X', party_type: null,
    entity_name: null, supplier_id: null, project_id: null, project_name: null, obra_id: null,
    obra_name: null, cost_center_id: null, plano_de_contas_id: null, created_at: null, updated_at: null,
    ...over,
} as Payable);

function renderTela(rows: Payable[], props: Partial<React.ComponentProps<typeof ContasPagarParcelas>> = {}) {
    return render(
        <ContasPagarParcelas
            rows={rows}
            organizationId="org1"
            vencDe=""
            vencAte=""
            loading={false}
            error={null}
            onReload={() => {}}
            onRowChanged={() => {}}
            onRowRemoved={() => {}}
            notify={() => {}}
            logoDaOrg={() => 'https://logo'}
            {...props}
        />
    );
}

const botaoPago = () => screen.getByTitle('Dar baixa: data, forma de pagamento e recibo');
const caixaRecibo = () => screen.queryByRole('checkbox', { name: /Emitir recibo/ }) as HTMLInputElement | null;

describe('Contas a Pagar — baixa com painel e recibo de pagamento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        svc.listarAtivosDaOrg.mockResolvedValue(new Map());
    });

    it('"Pago" abre o painel de pagamento; confirmar baixa e emite recibo PAGAMENTO', async () => {
        const onRowChanged = vi.fn();
        renderTela([linha({ id: 't1', party_name: 'Construtora Alfa' })], { onRowChanged });

        fireEvent.click(botaoPago());
        expect(await screen.findByRole('button', { name: /Confirmar pagamento/ })).toBeInTheDocument();
        // "Credor" está no cabeçalho da tabela E na coluna do painel (não "Pagador").
        expect(screen.getAllByText('Credor').length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText('Pagador')).toBeNull();
        expect(svc.darBaixa).not.toHaveBeenCalled();   // abrir não baixa
        expect(caixaRecibo()?.checked).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /Confirmar pagamento/ }));
        await waitFor(() => expect(svc.baixarPdf).toHaveBeenCalled());
        expect(svc.darBaixa).toHaveBeenCalledWith('t1', expect.objectContaining({ paymentType: null }));
        expect(svc.baixarPdf).toHaveBeenCalledWith('t1', { kind: 'PAGAMENTO', logoUrl: 'https://logo' });
        expect(onRowChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', effective_status: 'PAGO', status: 'CONCILIATED' }));
    });

    it('boleto: a caixa "Emitir recibo" vem desmarcada', async () => {
        renderTela([linha({ id: 'b1', source_system: 'BOLETO' })]);
        fireEvent.click(botaoPago());
        await waitFor(() => expect(caixaRecibo()).not.toBeNull());
        expect(caixaRecibo()?.checked).toBe(false);
    });

    it('folha: sem caixa de recibo, com o motivo, e a baixa não emite', async () => {
        renderTela([linha({ id: 'f1', source_system: 'LABOR' })]);
        fireEvent.click(botaoPago());
        expect(await screen.findByText(/não há um credor único para assinar o recibo/)).toBeInTheDocument();
        expect(caixaRecibo()).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Confirmar pagamento/ }));
        await waitFor(() => expect(svc.darBaixa).toHaveBeenCalledWith('f1', expect.anything()));
        expect(svc.baixarPdf).not.toHaveBeenCalled();
    });

    it('coluna Recibo mostra o número; o estorno tira o número da coluna', async () => {
        svc.listarAtivosDaOrg.mockResolvedValue(new Map([['p1', { id: 'r7', transaction_id: 'p1', receipt_number: 7 }]]));
        const paga = linha({ id: 'p1', status: 'CONCILIATED', business_status: 'PAGO', effective_status: 'PAGO' });
        renderTela([paga]);
        expect(await screen.findByText('Nº 000007')).toBeInTheDocument();
        expect(svc.listarAtivosDaOrg).toHaveBeenCalledWith('org1', 'PAGAMENTO');

        fireEvent.click(screen.getByTitle('Estornar baixa'));
        await waitFor(() => expect(svc.updateStatus).toHaveBeenCalledWith('p1', 'PREVISTO'));
        await waitFor(() => expect(screen.queryByText('Nº 000007')).not.toBeInTheDocument());
    });

    it('lote: "Dar baixa" abre o painel com as selecionadas em aberto', async () => {
        renderTela([linha({ id: 'a1', description: 'Parcela A' }), linha({ id: 'a2', description: 'Parcela B' })]);
        fireEvent.click(screen.getByTitle('Selecionar todas as parcelas desta página'));
        fireEvent.click(screen.getByRole('button', { name: /^Dar baixa/ }));
        expect(await screen.findByText('Confirmar pagamento de 2 títulos')).toBeInTheDocument();
    });
});
