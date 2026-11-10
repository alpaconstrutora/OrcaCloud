// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas — "Ocultar futuros" e vencimento em linha única
 * (pedido de 09/11/2026). Mocks iguais aos de ContasPagarParcelasAnoMes.test.tsx.
 * Datas longe de hoje (2020 / 2099) para não depender do relógio.
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
    transaction_date: '2020-01-01', due_date: '2020-01-10', amount: 10, direction: 'DEBIT',
    description: 'linha', category: null, status: 'PENDING', business_status: 'PREVISTO',
    effective_status: 'PREVISTO', party_id: null, party_name: 'Fornecedor X', party_type: null,
    entity_name: null, supplier_id: null, project_id: null, project_name: null, obra_id: null,
    obra_name: null, cost_center_id: null, plano_de_contas_id: null, created_at: null, updated_at: null,
    ...over,
} as Payable);

const ROWS = [
    linha({ id: 'p1', description: 'Parcela vencida', due_date: '2020-01-10', effective_status: 'VENCIDO' }),
    linha({ id: 'p2', description: 'Parcela futura', due_date: '2099-01-10' }),
    linha({ id: 'p3', description: 'Parcela sem data', due_date: null }),
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
            ocultarFuturos={false}
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

describe('ContasPagarParcelas — vencimentos futuros', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    });

    it('desligado: mostra passado, futuro e sem vencimento', () => {
        renderTela();
        for (const d of ['Parcela vencida', 'Parcela futura', 'Parcela sem data']) {
            expect(screen.getByText(d)).toBeTruthy();
        }
    });

    it('ligado: esconde só o que vence depois de hoje; sem vencimento continua', () => {
        renderTela({ ocultarFuturos: true });
        expect(screen.getByText('Parcela vencida')).toBeTruthy();
        expect(screen.getByText('Parcela sem data')).toBeTruthy();
        expect(screen.queryByText('Parcela futura')).toBeNull();
    });

    it('vencida: data e atraso na mesma linha (um único bloco, sem div empilhada)', () => {
        renderTela();
        const atraso = screen.getByText(/d atraso/);
        // O atraso é <span> dentro do bloco da data — antes era uma <div> abaixo dela.
        expect(atraso.tagName).toBe('SPAN');
        const celula = atraso.parentElement!;
        expect(celula.textContent).toMatch(/^10\/01\/2020 · \d+d atraso$/);
        expect(celula.getAttribute('title')).toBe(celula.textContent);
    });
});
