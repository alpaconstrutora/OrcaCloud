// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas — filtros Ano/Mês do vencimento.
 * Bug de 18/10/2026: o seletor de Ano ficava vazio em Parcelas (a lista de anos saía
 * só das notas) e Ano/Mês nem chegavam à tabela de parcelas. Mocks iguais aos de
 * ContasPagarParcelasAgrupar.test.tsx.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Payable } from '../../types/financial';

vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: vi.fn(async () => []),
        listPlanoContas: vi.fn(async () => []),
    },
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
    payableService: { updateStatus: vi.fn(), remove: vi.fn() },
    payableParty: (p: { party_name?: string; entity_name?: string }) => p.party_name || p.entity_name || '—',
}));
vi.mock('../../components/financeiro/ApropriarImovelSheet', () => ({ default: () => null }));
vi.mock('../../services/financialReceiptService', () => ({
    financialReceiptService: { listarAtivosDaOrg: vi.fn(async () => new Map()), baixarPdf: vi.fn() },
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import ContasPagarParcelas from '../../components/ContasPagarParcelas';

const linha = (over: Partial<Payable>): Payable => ({
    id: 'x', organization_id: 'org1', source_system: 'CONTRACT_PARCELADO', reference_id: null,
    transaction_date: '2026-10-01', due_date: '2026-10-10', amount: 10, direction: 'DEBIT',
    description: 'linha', category: null, status: 'PENDING', business_status: 'PREVISTO',
    effective_status: 'PREVISTO', party_id: null, party_name: 'Fornecedor X', party_type: null,
    entity_name: null, supplier_id: null, project_id: null, project_name: null, obra_id: null,
    obra_name: null, cost_center_id: null, plano_de_contas_id: null, created_at: null, updated_at: null,
    ...over,
} as Payable);

const ROWS = [
    linha({ id: 'p1', description: 'Parcela 2025 dez', due_date: '2025-12-05' }),
    linha({ id: 'p2', description: 'Parcela 2026 jan', due_date: '2026-01-15' }),
    linha({ id: 'p3', description: 'Parcela 2026 out', due_date: '2026-10-20' }),
    linha({ id: 'p4', description: 'Parcela sem data', due_date: null }),
];

function renderTela(props: Partial<React.ComponentProps<typeof ContasPagarParcelas>> = {}) {
    return render(
        <ContasPagarParcelas
            rows={ROWS}
            organizationId="org1"
            vencDe=""
            vencAte=""
            vencAno=""
            vencMes=""
            loading={false}
            error={null}
            onReload={() => {}}
            onRowChanged={() => {}}
            onRowRemoved={() => {}}
            notify={() => {}}
            {...props}
        />
    );
}

describe('ContasPagarParcelas — Ano/Mês do vencimento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    });

    it('sem Ano/Mês mostra tudo, inclusive a parcela sem vencimento', () => {
        renderTela();
        for (const d of ['Parcela 2025 dez', 'Parcela 2026 jan', 'Parcela 2026 out', 'Parcela sem data']) {
            expect(screen.getByText(d)).toBeTruthy();
        }
    });

    it('só o ano: o ano inteiro; parcela sem vencimento fica de fora', () => {
        renderTela({ vencAno: '2026' });
        expect(screen.getByText('Parcela 2026 jan')).toBeTruthy();
        expect(screen.getByText('Parcela 2026 out')).toBeTruthy();
        expect(screen.queryByText('Parcela 2025 dez')).toBeNull();
        expect(screen.queryByText('Parcela sem data')).toBeNull();
    });

    it('só o mês: aquele mês em todos os anos', () => {
        renderTela({ vencMes: '12' });
        expect(screen.getByText('Parcela 2025 dez')).toBeTruthy();
        expect(screen.queryByText('Parcela 2026 jan')).toBeNull();
    });

    it('ano e mês juntos: aquele mês daquele ano', () => {
        renderTela({ vencAno: '2026', vencMes: '10' });
        expect(screen.getByText('Parcela 2026 out')).toBeTruthy();
        expect(screen.queryByText('Parcela 2026 jan')).toBeNull();
        expect(screen.queryByText('Parcela 2025 dez')).toBeNull();
    });
});
