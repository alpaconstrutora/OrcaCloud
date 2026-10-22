// @vitest-environment jsdom
/**
 * Suprimentos — "Agrupar" em Contratos, Cotações, Pedidos, Recebimento e
 * Almoxarifado (Saldos, Movimentos, Itens). Pedido de 17/10/2026,
 * docs/planos/2026-10-17-suprimentos-agrupar.md
 *
 * Telas montadas de verdade com os serviços simulados: cabeçalho do grupo com a
 * contagem (e o total só onde a tabela tem valor em dinheiro), recolher, e em
 * Pedidos o "selecionar todos" ignorando grupo recolhido.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Encadeamento do supabase-js (vi.hoisted: o vi.mock é içado acima de qualquer const).
const { cadeia } = vi.hoisted(() => {
    const c: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'order', 'is', 'not', 'limit', 'match', 'maybeSingle', 'single'].forEach(m => { c[m] = () => c; });
    c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, erro);
    return { cadeia: c };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => cadeia, rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => {
    const estado = { activeOrganizationId: 'org1', organizations: [{ id: 'org1', name: 'Alpa' }], projects: [], companies: [], viewFocus: null, setViewFocus: () => {} };
    const useStore = (sel?: (s: unknown) => unknown) => (sel ? sel(estado) : estado);
    useStore.getState = () => estado;
    return { useStore };
});
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
}));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { mapObrasToEmpreendimentos: vi.fn(async () => ({})), list: vi.fn(async () => []) } }));

// ── Contratos ───────────────────────────────────────────────────────
const contrato = (id: string, title: string, status: string, current_value: number) => ({
    id, number: `CT-${id}`, title, status, current_value, start_date: '2026-03-01', end_date: null, supplier_id: 's1', project_id: null,
});
vi.mock('../../services/contractService', () => ({ contractService: { listContracts: vi.fn(async () => [
    contrato('1', 'Fundação', 'Ativo', 1000), contrato('2', 'Pintura', 'Encerrado', 300), contrato('3', 'Elétrica', 'Ativo', 500),
]) } }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => [{ id: 's1', name: 'Construtora Alfa' }]) }, getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '' }));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }) } }));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: vi.fn(async () => []) } }));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({ financialRegistryService: { listCostCenters: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) } }));

// ── Cotações ────────────────────────────────────────────────────────
vi.mock('../../services/quotationService', () => ({ quotationService: { listRequests: vi.fn(async () => [
    { id: 'q1', number: 'COT-1', title: 'Cimento', projectName: 'Obra Garden', projectId: 'p1', deadline: '2026-10-10', status: 'Aberta', items: [] },
    { id: 'q2', number: 'COT-2', title: 'Aço', projectName: 'Obra Garden', projectId: 'p1', deadline: '2026-11-10', status: 'Concluída', items: [] },
    { id: 'q3', number: 'COT-3', title: 'Areia', projectName: 'Obra Bella', projectId: 'p2', deadline: '2026-10-20', status: 'Aberta', items: [] },
]) } }));

// ── Pedidos / Recebimento ───────────────────────────────────────────
const pedido = (id: string, supplierName: string, status: string, total: number) => ({
    id, number: `PC-${id}`, supplierName, status, projectName: 'Obra Garden', created_at: '2026-10-05T10:00:00Z',
    deliveryDate: '2026-10-20', items: [{ total }],
});
vi.mock('../../services/orderService', () => ({ orderService: { listOrders: vi.fn(async () => [
    pedido('1', 'Cimentos Beta', 'Rascunho', 100), pedido('2', 'Areia Gama', 'Rascunho', 40),
    pedido('3', 'Cimentos Beta', 'Rascunho', 60), pedido('4', 'Cimentos Beta', 'Confirmado', 10),
]) } }));

// ── Almoxarifado ────────────────────────────────────────────────────
vi.mock('../../services/inventoryService', () => ({ inventoryService: {
    listStockItems: vi.fn(async () => []), listWarehouses: vi.fn(async () => []), listLeadTimes: vi.fn(async () => []),
    listTransfers: vi.fn(async () => []), getNetPositions: vi.fn(async () => []), getStockSummary: vi.fn(async () => []),
    listAssetLinks: vi.fn(async () => new Map()), listMaterialRequests: vi.fn(async () => []),
    listBalances: vi.fn(async () => [
        { warehouseId: 'w1', warehouseName: 'Central', inputCode: 'C1', inputDescription: 'Cimento', inputUnit: 'sc', quantity: 10, avgUnitCost: 30, totalValue: 300 },
        { warehouseId: 'w2', warehouseName: 'Canteiro', inputCode: 'C1', inputDescription: 'Cimento', inputUnit: 'sc', quantity: 5, avgUnitCost: 30, totalValue: 150 },
        { warehouseId: 'w1', warehouseName: 'Central', inputCode: 'A1', inputDescription: 'Areia', inputUnit: 'm3', quantity: 2, avgUnitCost: 50, totalValue: 100 },
    ]),
    listMovements: vi.fn(async () => [
        { id: 'm1', type: 'in', movedAt: '2026-09-10', warehouseName: 'Central', inputCode: 'C1', inputDescription: 'Cimento', quantity: 10, inputUnit: 'sc', totalCost: 300 },
        { id: 'm2', type: 'out', movedAt: '2026-10-02', warehouseName: 'Central', inputCode: 'C1', inputDescription: 'Cimento', quantity: 4, inputUnit: 'sc', totalCost: 120 },
        { id: 'm3', type: 'in', movedAt: '2026-10-05', warehouseName: 'Canteiro', inputCode: 'A1', inputDescription: 'Areia', quantity: 2, inputUnit: 'm3', totalCost: 100 },
    ]),
} }));

import SupplyChainContractList from '../../components/SupplyChainContractList';
import SupplyChainQuotationList from '../../components/SupplyChainQuotationList';
import SupplyChainOrderList from '../../components/SupplyChainOrderList';
import SupplyChainReceiptManager from '../../components/SupplyChainReceiptManager';
import { InventoryModule } from '../../components/InventoryModule';
import StockItemsTab from '../../components/inventory/StockItemsTab';
import { STOCK_ITEMS_COLUMNS } from '../../components/inventory/StockItemsTab';
import { useTableColumns } from '../../components/ui/TableUtils';
import type { StockItem } from '../../types/inventory';

const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;
const pedacos = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.trim()).filter(Boolean).join(' ');
const agrupar = (title: string, campo: string) => fireEvent.change(screen.getByTitle(title), { target: { value: campo } });
const rotulos = () => Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('Suprimentos › Contratos', () => {
    it('agrupa por status (na ordem do fluxo) com o total do valor atual', async () => {
        render(<SupplyChainContractList projectId="" organizationId="org1" onCreateNew={() => {}} onViewDetails={() => {}} />);
        await screen.findByText('Fundação');
        agrupar('Agrupar os contratos', 'status');
        expect(rotulos()).toEqual(['Ativo', 'Encerrado']);
        expect(pedacos('Ativo')).toMatch(/^Ativo 2 R\$\s?1\.500,00$/);
        fireEvent.click(cabecalho('Ativo'));
        expect(screen.queryByText('Fundação')).toBeNull();
        expect(screen.getByText('Pintura')).toBeTruthy();
    });
});

describe('Suprimentos › Cotações', () => {
    it('agrupa por obra, só com a contagem (cotação não tem valor na tabela)', async () => {
        render(<SupplyChainQuotationList onCreateNew={() => {}} onViewDetails={() => {}} onViewComparison={() => {}} />);
        await screen.findByText('Cimento');
        agrupar('Agrupar as cotações', 'obra');
        expect(pedacos('Obra Garden')).toBe('Obra Garden 2');
        expect(pedacos('Obra Bella')).toBe('Obra Bella 1');
    });
});

describe('Suprimentos › Pedidos', () => {
    it('agrupa por fornecedor com o total; "selecionar todos" não marca pedido em grupo recolhido', async () => {
        render(<SupplyChainOrderList onCreateNew={() => {}} onViewDetails={() => {}} onViewLogistics={() => {}} />);
        await screen.findByText('PC-1');
        agrupar('Agrupar os pedidos', 'fornecedor');
        expect(pedacos('Cimentos Beta')).toMatch(/^Cimentos Beta 3 R\$\s?170,00$/);
        fireEvent.click(cabecalho('Cimentos Beta'));
        const marcarTodos = document.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(marcarTodos);
        // Só o pedido de Areia Gama (rascunho) está à vista e é selecionável.
        expect(screen.getByText(/^1 selecionado/)).toBeTruthy();
    });
});

describe('Suprimentos › Recebimento', () => {
    it('agrupa por status logístico, só com a contagem', async () => {
        render(<SupplyChainReceiptManager onViewOrder={() => {}} />);
        await screen.findByText('#PC-4');
        agrupar('Agrupar os recebimentos', 'status');
        expect(pedacos('Confirmado')).toBe('Confirmado 1');
    });
});

describe('Suprimentos › Almoxarifado', () => {
    it('Saldos: agrupa por insumo com o valor total em estoque', async () => {
        render(<InventoryModule activeOrganizationId="org1" onChangeView={() => {}} />);
        await screen.findAllByText('Central');
        agrupar('Agrupar os saldos', 'insumo');
        expect(pedacos('Cimento')).toMatch(/^Cimento 2 R\$\s?450,00$/);
        expect(rotulos()).toEqual(['Areia', 'Cimento']);
        // Decrescente (molde ClickUp) inverte a ordem dos grupos.
        fireEvent.change(screen.getAllByRole('combobox', { name: 'Ordem dos grupos' })[0], { target: { value: 'desc' } });
        expect(rotulos()).toEqual(['Cimento', 'Areia']);
    });

    it('Movimentos: agrupa por tipo (na ordem Entrada → Saída) com o valor', async () => {
        render(<InventoryModule activeOrganizationId="org1" onChangeView={() => {}} />);
        await screen.findAllByText('Central');
        fireEvent.click(screen.getByText('Movimentos', { selector: 'button, button *' }));
        agrupar('Agrupar os movimentos', 'tipo');
        expect(rotulos()).toEqual(['Entrada', 'Saída']);
        expect(pedacos('Entrada')).toMatch(/^Entrada 2 R\$\s?400,00$/);
    });

    it('Itens: agrupa por situação (Ativo → Inativo), só contagem', () => {
        const item = (id: string, inputDescription: string, isActive: boolean, category: string): StockItem =>
            ({ id, inputCode: id, inputDescription, inputUnit: 'un', category, isActive, source: 'avulso' } as unknown as StockItem);
        function Tela() {
            const tableItems = useTableColumns(STOCK_ITEMS_COLUMNS, 'teste:itens');
            return <StockItemsTab items={[item('i1', 'Parafuso', false, 'Fixação'), item('i2', 'Prego', true, 'Fixação'), item('i3', 'Luva', true, 'EPI')]}
                tableItems={tableItems} onEdit={() => {}} onNew={() => {}} onImport={() => {}} onChanged={() => {}} />;
        }
        render(<Tela />);
        agrupar('Agrupar os itens', 'situacao');
        expect(rotulos()).toEqual(['Ativo', 'Inativo']);
        expect(pedacos('Ativo')).toBe('Ativo 2');
        fireEvent.click(cabecalho('Inativo'));
        expect(screen.queryByText('Parafuso')).toBeNull();
        expect(within(document.body).getByText('Prego')).toBeTruthy();
    });
});
