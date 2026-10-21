// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas com DARF — plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md.
 *
 * Decisão do usuário: o DARF aparece como UMA linha, com o total; "Dar baixa"
 * paga todos os tributos de uma vez; a linha expande para mostrar a composição.
 * Trava também o que NÃO pode aparecer na linha sintética (o id dela é do DARF,
 * não de internal_transactions): PIX/Asaas, apropriar a imóvel, editar/excluir.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Darf, Payable } from '../../types/financial';
import { colapsarDarfs } from '../../utils/darf';

const m = vi.hoisted(() => ({
    darBaixa: vi.fn(async () => ['pis', 'cofins', 'multa']),
    estornar: vi.fn(async () => undefined),
    navigate: vi.fn(),
}));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: { listCostCenters: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) },
}));
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => []) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }) } }));
vi.mock('../../services/propertyExpenseService', () => ({ propertyExpenseService: { allocationSummary: vi.fn(async () => new Map()) } }));
vi.mock('../../services/payableService', () => ({
    payableService: { updateStatus: vi.fn(), remove: vi.fn(), darBaixa: vi.fn(), urlDoAnexo: vi.fn() },
    payableParty: (p: { party_name?: string; entity_name?: string }) => p.party_name || p.entity_name || '—',
    STATUS_ASAAS_TRAVA_TITULO: ['APPROVED', 'PENDING', 'SCHEDULED', 'DONE'],
}));
vi.mock('../../services/darfService', () => ({ darfService: { darBaixa: m.darBaixa, estornar: m.estornar } }));
vi.mock('../../services/asaasContaService', () => ({ asaasContaService: { contaDaOrg: vi.fn(async () => 'conta-1') } }));
vi.mock('../../services/supplierPaymentService', () => ({ supplierPaymentService: { byTransactions: vi.fn(async () => ({})), cancel: vi.fn() } }));
vi.mock('../../services/alcadaDaBaixa', () => ({ idsComAlcadaPendente: vi.fn(async () => new Set()), MOTIVO_ALCADA_PENDENTE: 'alçada' }));
vi.mock('../../store/useStore', () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ navigateToFocus: m.navigate }) }));
vi.mock('../../components/financeiro/ApropriarImovelSheet', () => ({ default: () => null }));
vi.mock('../../services/financialReceiptService', () => ({
    financialReceiptService: { listarAtivosDaOrg: vi.fn(async () => new Map()), baixarPdf: vi.fn() },
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import ContasPagarParcelas from '../../components/ContasPagarParcelas';

const linha = (over: Partial<Payable>): Payable => ({
    id: 'x', organization_id: 'org1', source_system: 'COMMERCIAL', transaction_date: '2026-10-05', due_date: '2099-10-30',
    amount: 100, direction: 'DEBIT', description: 'linha', status: 'PENDING', business_status: 'PREVISTO',
    effective_status: 'PREVISTO', party_name: 'PIS', party_type: 'TAX', darf_id: 'D1', ...over,
} as Payable);
const darf: Darf = {
    id: 'D1', organization_id: 'org1', competencia: '2026-10-01', due_date: '2099-10-30',
    codigo_barras: null, numero_documento: null, observacao: null, documento_path: null, documento_nome: null,
    principal: 300, multa: 10, juros: 0, total: 310, qtd_tributos: 2, tributos_nomes: 'COFINS, PIS', n_membros: 3, n_pagos: 0,
    payment_date: null, payment_type: null, conciliado_no_extrato: false, alcada_pendente: false, asaas_em_curso: false, status_efetivo: 'PREVISTO',
};
const MEMBROS = [
    linha({ id: 'pis', description: 'CTL-1 - PIS - Parcela 1/12', amount: 100 }),
    linha({ id: 'cofins', description: 'CTL-1 - COFINS - Parcela 1/12', amount: 200, party_name: 'COFINS' }),
    linha({ id: 'multa', description: 'Multa — DARF 10/2026', amount: 10, source_system: 'DARF', party_type: 'GOVERNMENT', party_name: 'Receita Federal' }),
];
const SOLTO = linha({ id: 'solto', darf_id: null, source_system: 'CONTRACT_PARCELADO', party_type: null, party_name: 'Fornecedor X', description: 'Medição 3' });

function renderTela(props: Partial<React.ComponentProps<typeof ContasPagarParcelas>> = {}, linhas: Payable[] = colapsarDarfs([SOLTO, ...MEMBROS], [darf])) {
    return render(
        <ContasPagarParcelas
            rows={linhas}
            organizationId="org1"
            vencDe="" vencAte="" vencAno="" vencMes=""
            loading={false}
            error={null}
            onReload={() => {}}
            onRowChanged={() => {}}
            onRowRemoved={() => {}}
            notify={() => {}}
            {...props}
        />,
    );
}

const linhaDoDarf = () => screen.getByText('DARF 10/2026 · COFINS, PIS + multa/juros').closest('tr')!;

describe('Contas a Pagar — DARF como uma linha', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        // jsdom não implementa scrollIntoView (o deep-link rola até a linha).
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('os tributos do DARF não aparecem soltos; a linha traz o total', async () => {
        renderTela();
        await screen.findByText('Medição 3');
        expect(screen.queryByText('CTL-1 - PIS - Parcela 1/12')).toBeNull();
        const tr = linhaDoDarf();
        expect(within(tr).getByText('Receita Federal (DARF)')).toBeTruthy();
        expect(tr.textContent).toMatch(/310,00/);
        expect(screen.getByText('2 parcelas')).toBeTruthy();
    });

    it('na linha do DARF: Dar baixa, sem PIX, sem apropriar, sem editar/excluir', async () => {
        renderTela();
        await screen.findByText('Medição 3');
        const tr = linhaDoDarf();
        expect(within(tr).getByRole('button', { name: /Dar baixa/ })).toBeTruthy();
        await waitFor(() => expect(within(screen.getByText('Medição 3').closest('tr')!).getByRole('button', { name: /PIX/ })).toBeTruthy());
        expect(within(tr).queryByRole('button', { name: /PIX|Asaas/ })).toBeNull();
        expect(within(tr).queryByTitle('Apropriar a imóvel')).toBeNull();
        expect(within(tr).queryByTitle('Excluir')).toBeNull();
    });

    it('o chevron abre a composição (tributos e encargo)', async () => {
        renderTela();
        await screen.findByText('Medição 3');
        fireEvent.click(within(linhaDoDarf()).getByTitle('Ver a composição do DARF'));
        expect(screen.getByText('CTL-1 - PIS - Parcela 1/12')).toBeTruthy();
        expect(screen.getByText('Multa — DARF 10/2026')).toBeTruthy();
        expect(screen.getByText('Encargo')).toBeTruthy();
    });

    it('deep-link pelo id de um TRIBUTO cai na linha do DARF e abre a composição', async () => {
        const onFocusConsumed = vi.fn();
        renderTela({ focusId: 'cofins', onFocusConsumed });
        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(true, false));
        expect(screen.getByText('CTL-1 - COFINS - Parcela 1/12')).toBeTruthy();
    });

    it('"Abrir em Tributos a Pagar › DARFs" leva ao DARF', async () => {
        renderTela();
        await screen.findByText('Medição 3');
        fireEvent.click(within(linhaDoDarf()).getByTitle('Abrir em Tributos a Pagar › DARFs (editar, desagrupar)'));
        expect(m.navigate).toHaveBeenCalledWith('tributos-a-pagar', 'D1', 'DARF');
    });

    it('DARF pago e conciliado: estorno desligado dizendo para desfazer a conciliação', async () => {
        const pagos = MEMBROS.map(x => ({ ...x, status: 'CONCILIATED' as const, business_status: 'PAGO' as const, effective_status: 'PAGO' as const }));
        renderTela({}, colapsarDarfs([SOLTO, ...pagos], [{ ...darf, conciliado_no_extrato: true, n_pagos: 3, status_efetivo: 'PAGO' }]));
        await screen.findByText('Medição 3');
        const estorno = within(linhaDoDarf()).getByTitle('Estornar a baixa do DARF') as HTMLButtonElement;
        expect(estorno.disabled).toBe(true);
        expect(estorno.closest('span')!.getAttribute('title')).toMatch(/desfaça a conciliação/);
        // Sem recibo de credor: o "—" da coluna Recibo diz por quê.
        expect(within(linhaDoDarf()).getByTitle(/DARF não tem recibo de credor/)).toBeTruthy();
    });
});
