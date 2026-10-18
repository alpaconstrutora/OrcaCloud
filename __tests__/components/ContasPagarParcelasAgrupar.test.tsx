// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas — "Agrupar" junto com a paginação da exibição.
 * Pedido de 15/10/2026, docs/planos/2026-10-15-financeiro-agrupar-propagacao.md
 * Mocks iguais aos de ContasPagarDeepLink.test.tsx.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

// 120 de Alfa, 30 de Beta, 5 de Gama — página de 100 corta Alfa.
const ROWS = [
    ...Array.from({ length: 120 }, (_, i) => linha({ id: `a${i}`, description: `Parcela Alfa ${i}`, party_name: 'Construtora Alfa' })),
    ...Array.from({ length: 30 }, (_, i) => linha({ id: `b${i}`, description: `Parcela Beta ${i}`, party_name: 'Cimentos Beta', amount: 1 })),
    ...Array.from({ length: 5 }, (_, i) => linha({ id: `g${i}`, description: `Parcela Gama ${i}`, party_name: 'Gama Ltda' })),
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

const cabecalhos = () => Array.from(document.querySelectorAll('tbody span.font-semibold'))
    .map(e => Array.from(e.parentElement!.children).map(c => c.textContent!.trim()).filter(Boolean).join(' '));
const linhasDeDado = () => document.querySelectorAll('tbody tr[class*="hover:bg-blue-50"]').length;

describe('ContasPagarParcelas — Agrupar com paginação', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    });

    it('a página conta linhas de dado; o grupo cortado repete o cabeçalho com "(continua)" e o total do grupo inteiro', () => {
        renderTela();
        fireEvent.change(screen.getByTitle('Agrupar as parcelas'), { target: { value: 'credor' } });

        expect(cabecalhos()).toHaveLength(1);
        expect(cabecalhos()[0]).toMatch(/^Construtora Alfa 120 R\$\s?1\.200,00$/);
        expect(linhasDeDado()).toBe(100);

        fireEvent.click(screen.getByText('Próxima'));
        const p2 = cabecalhos();
        expect(p2[0]).toMatch(/^Construtora Alfa \(continua\) 120/);
        expect(p2[1]).toMatch(/^Cimentos Beta 30 R\$\s?30,00$/);
        expect(p2[2]).toMatch(/^Gama Ltda 5/);
        expect(linhasDeDado()).toBe(55);
    });

    it('parcela sem credor (a célula mostra "—") cai em "Sem credor", por último', () => {
        renderTela({ rows: [linha({ id: 'x1', party_name: undefined, description: 'Sem ninguém' }), linha({ id: 'x2', party_name: 'Zeta', description: 'Com Zeta' })] });
        fireEvent.change(screen.getByTitle('Agrupar as parcelas'), { target: { value: 'credor' } });
        expect(cabecalhos().map(c => c.split(' ')[0] + (c.startsWith('Sem') ? ' credor' : ''))).toEqual(['Zeta', 'Sem credor']);
    });

    it('recolher o grupo grande traz os demais para a página 1', () => {
        renderTela();
        fireEvent.change(screen.getByTitle('Agrupar as parcelas'), { target: { value: 'credor' } });
        fireEvent.click(screen.getByText('Construtora Alfa', { selector: 'span.font-semibold' }));
        expect(cabecalhos().map(c => c.split(' ')[0])).toEqual(['Construtora', 'Cimentos', 'Gama']);
        expect(linhasDeDado()).toBe(35);
        expect(screen.getByText('1–35 de 35')).toBeTruthy();
    });

    it('deep-link para parcela dentro de grupo recolhido abre o grupo e vai à página dela', async () => {
        // Agrupado por credor e com Alfa recolhido numa visita anterior não existe
        // (recolhidos são só da sessão) — o caso real é recolher e chegar um link.
        const onFocusConsumed = vi.fn();
        const { rerender } = renderTela();
        fireEvent.change(screen.getByTitle('Agrupar as parcelas'), { target: { value: 'credor' } });
        fireEvent.click(screen.getByText('Construtora Alfa', { selector: 'span.font-semibold' }));
        expect(screen.queryByText('Parcela Alfa 110')).toBeNull();

        rerender(
            <ContasPagarParcelas rows={ROWS} organizationId="org1" vencDe="" vencAte="" vencAno="" vencMes="" loading={false} error={null}
                onReload={() => {}} onRowChanged={() => {}} onRowRemoved={() => {}} notify={() => {}}
                focusId="a110" onFocusConsumed={onFocusConsumed} />,
        );
        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(true, false));
        expect(screen.getByText('Parcela Alfa 110')).toBeTruthy();
        expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    });

    it('Shift+clique entre dois grupos marca só as linhas que estão entre elas na tela', () => {
        renderTela();
        fireEvent.change(screen.getByTitle('Agrupar as parcelas'), { target: { value: 'credor' } });
        fireEvent.click(screen.getByText('Construtora Alfa', { selector: 'span.font-semibold' }));
        const check = (texto: string) => within(screen.getByText(texto).closest('tr')!).getByRole('checkbox');
        fireEvent.click(check('Parcela Beta 28'));
        fireEvent.click(check('Parcela Gama 1'), { shiftKey: true });
        // Beta 28, Beta 29, Gama 0, Gama 1 — nenhuma de Alfa (recolhido).
        expect(screen.getByText(/4 selecionad/)).toBeTruthy();
    });
});
