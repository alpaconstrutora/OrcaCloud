// @vitest-environment jsdom
/**
 * Contas a Pagar › Parcelas — deep-link vindo de outro módulo (`viewFocus`).
 * Pedido de 09/09/2026, docs/planos/2026-09-09-portal-parceiro-financeiro-visao-credor.md
 *
 * O caso que o typecheck não pega e que quebraria no uso real: `search`,
 * `statusFiltro` e `origemFiltro` são `usePersistedState` — sobrevivem a reload.
 * Sem zerá-los, "Ver em Contas a Pagar" cai numa tabela VAZIA por causa de um
 * filtro salvo dias antes, e nada na tela explica o porquê.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const ROWS = [
    linha({ id: 'alvo', description: 'Medição 7 do contrato', party_name: 'Construtora Alfa' }),
    linha({ id: 'outro', description: 'Pedido de cimento', party_name: 'Cimentos Beta' }),
];

function renderTela(props: Partial<React.ComponentProps<typeof ContasPagarParcelas>> = {}) {
    return render(
        <ContasPagarParcelas
            rows={ROWS}
            organizationId="org1"
            vencDe=""
            vencAte=""
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

describe('ContasPagarParcelas — deep-link por viewFocus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        // jsdom não implementa scrollIntoView.
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    });

    it('limpa o filtro salvo que escondia a linha e avisa o pai', async () => {
        // Filtro persistido de uma sessão anterior: só "cimento" aparece.
        window.localStorage.setItem('contasPagarParcelas:search', JSON.stringify('cimento'));
        const onFocusConsumed = vi.fn();
        const onClearPeriod = vi.fn();

        renderTela({ focusId: 'alvo', onFocusConsumed, onClearPeriod });

        // Sem a limpeza, a linha-alvo nunca chegaria a renderizar.
        expect(await screen.findByText('Medição 7 do contrato')).toBeInTheDocument();
        expect(onClearPeriod).toHaveBeenCalled();
        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(true, true));
    });

    it('mantém os filtros do usuário quando a linha já está visível', async () => {
        const onFocusConsumed = vi.fn();
        const onClearPeriod = vi.fn();

        renderTela({ focusId: 'alvo', onFocusConsumed, onClearPeriod });

        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(true, false));
        expect(onClearPeriod).not.toHaveBeenCalled();
    });

    it('reporta achou=false quando o título não está no recorte carregado', async () => {
        const onFocusConsumed = vi.fn();

        renderTela({ focusId: 'de-outra-org', onFocusConsumed });

        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(false, false));
    });
});

/**
 * Paginação da exibição (docs/planos/2026-09-28-contas-a-pagar-lento.md).
 * Desenhar as ~2.000 parcelas de uma vez congelava a tela ~600 ms. O <tbody>
 * passa a ter só a página; o resto (busca, total, export) segue na lista toda.
 */
const MUITAS = Array.from({ length: 250 }, (_, i) =>
    linha({ id: `p${i}`, description: `Parcela ${i}`, party_name: `Credor ${i}` }));

function renderMuitas(props: Partial<React.ComponentProps<typeof ContasPagarParcelas>> = {}) {
    return renderTela({ rows: MUITAS, ...props });
}

const linhasDoCorpo = (container: HTMLElement) => container.querySelectorAll('tbody tr');

describe('ContasPagarParcelas — paginação da exibição', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    });

    it('desenha só 100 linhas de 250, e o rodapé conta a lista inteira', () => {
        const { container } = renderMuitas();
        expect(linhasDoCorpo(container)).toHaveLength(100);
        expect(screen.getByText('1–100 de 250')).toBeInTheDocument();
        expect(screen.getByText('250 parcelas')).toBeInTheDocument();
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Próxima'));
        expect(screen.getByText('Parcela 100')).toBeInTheDocument();
        expect(screen.queryByText('Parcela 0')).not.toBeInTheDocument();
    });

    it('deep-link para um título da página 2 vai até a página dele', async () => {
        const onFocusConsumed = vi.fn();
        renderMuitas({ focusId: 'p180', onFocusConsumed });
        expect(await screen.findByText('Parcela 180')).toBeInTheDocument();
        await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledWith(true, false));
        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    });

    it('linha que muda de status não joga o usuário de volta para a página 1 (§22)', () => {
        const props = {
            organizationId: 'org1', vencDe: '', vencAte: '', loading: false, error: null,
            onReload: () => {}, onRowChanged: () => {}, onRowRemoved: () => {}, notify: () => {},
        };
        const { rerender } = render(<ContasPagarParcelas rows={MUITAS} {...props} />);
        fireEvent.click(screen.getByText('Próxima'));
        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
        const paga = MUITAS.map(r => r.id === 'p150' ? { ...r, business_status: 'PAGO', effective_status: 'PAGO' } as Payable : r);
        rerender(<ContasPagarParcelas rows={paga} {...props} />);
        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    });

    it('busca volta para a página 1 e acha linha de qualquer página', () => {
        renderMuitas();
        fireEvent.click(screen.getByText('Próxima'));
        fireEvent.change(screen.getByPlaceholderText('Buscar credor, descrição ou obra...'), { target: { value: 'Parcela 249' } });
        expect(screen.getByText('Parcela 249')).toBeInTheDocument();
        expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
    });

    it('"selecionar todos" marca só a página visível', () => {
        const { container } = renderMuitas();
        fireEvent.click(screen.getByTitle('Selecionar todas as parcelas desta página'));
        const marcadas = [...container.querySelectorAll('tbody input[type="checkbox"]')]
            .filter(el => (el as HTMLInputElement).checked);
        expect(marcadas).toHaveLength(100);
        expect(screen.getByText('100 selecionadas')).toBeInTheDocument();
    });
});
