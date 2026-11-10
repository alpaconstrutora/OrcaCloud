// @vitest-environment jsdom
/**
 * Suprimentos › Pedidos › detalhe do pedido › aba "Itens do Pedido" (10/11/2026).
 *
 * Pedido do usuário: "Itens do pedido e Itens avulsos nao fica duplicado?" —
 * escolha: fica "Itens do pedido", mantendo o "+ Item avulso" e o campo para
 * incluir avulsos.
 *
 * Embutido no detalhe, o formulário:
 *   1. não desenha a tabela "Itens avulsos" (a do detalhe já lista os itens);
 *   2. desenha o "+ Item avulso" na régua de "Itens do pedido", e incluir grava
 *      na hora, sobre os itens lidos do servidor;
 *   3. quando o detalhe grava itens (versão nova), relê os itens — o "Salvar
 *      alterações" seguinte manda a lista nova com a versão nova.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const OBRAS = [{ id: 'obra-1', name: 'Obra Alfa', settings: {} }];
const ORCAMENTO = [{ id: 'b1', quantity: 5, sinapiItem: { code: 'ORC-1', description: 'Concreto usinado', unit: 'M3', price: 500, type: 'INPUT' } }];

const ITENS_V3 = [
    { code: 'ORC-1', description: 'Concreto usinado', unit: 'M3', quantity: 5, unitPrice: 500, total: 2500 },
    { code: 'AV-1', description: 'Cimento CP-II', unit: 'SC', quantity: 10, unitPrice: 40, total: 400, avulso: true },
];
const PEDIDO = {
    id: 'ord-1', number: 'PC-A-001', projectId: 'obra-1', supplierId: 'forn-1', deliveryDate: '2026-10-01',
    status: 'Rascunho', version: 3, items: ITENS_V3,
};

vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => [{ id: 'forn-1', name: 'Fornecedor Um' }]) },
    getSupplierDisplayName: (s: { name: string }) => s.name,
}));
vi.mock('../../services/projectService', () => ({
    projectService: {
        listProjects: vi.fn(async () => OBRAS),
        loadProject: vi.fn(async (id: string) => ({ ...OBRAS.find(o => o.id === id)!, budget: [] })),
    },
}));
vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: {
        list: vi.fn(async () => [{ id: 'emp-a', name: 'Empreendimento A' }]),
        mapObrasToEmpreendimentos: vi.fn(async () => ({ 'obra-1': { id: 'emp-a', name: 'Empreendimento A' } })),
    },
}));
vi.mock('../../services/budgetResolver', () => ({ resolveProjectBudget: vi.fn(async () => ({ budget: ORCAMENTO })) }));
vi.mock('../../services/orderService', () => ({
    orderService: {
        listOrders: vi.fn(async () => [PEDIDO]),
        getOrderById: vi.fn(async () => PEDIDO),
        updateOrder: vi.fn(async () => ({ version: 4 })),
        createOrder: vi.fn(async () => ({})),
    },
}));
vi.mock('../../services/sinapiService', () => ({ sinapiService: { getItemsByCodes: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: { listPaymentAccounts: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) },
}));
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/orderNumberRegenService', () => ({
    getOrderNumberLockReason: vi.fn(async () => null),
    regenerateOrderNumber: vi.fn(async () => 'X'),
}));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org-1' }) }));
vi.mock('../../components/SupplierSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/CostCenterSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/PlanoContasSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/MaterialSelectionModal', () => ({ default: () => null }));
vi.mock('../../components/DatabasePickerModal', () => ({ default: () => null }));

import { orderService } from '../../services/orderService';
import SupplyChainOrderForm from '../../components/SupplyChainOrderForm';
import { ConfirmProvider } from '../../components/ui/confirm';

type Itens = typeof ITENS_V3;

function montar(barraItens: HTMLElement, barraSalvar: HTMLElement, onSave = vi.fn()) {
    const ui = (versao: number, itens: Itens) => (
        <ConfirmProvider>
            <SupplyChainOrderForm
                embedded painel="itens" editingOrderId="ord-1"
                barraItens={barraItens} barraDeAcoes={barraSalvar}
                itensGravados={itens} versaoGravada={versao}
                onBack={() => {}} onSave={onSave}
            />
        </ConfirmProvider>
    );
    const r = render(ui(3, ITENS_V3));
    return { ...r, regravar: (versao: number, itens: Itens) => r.rerender(ui(versao, itens)), onSave };
}

function barra(id: string) {
    const el = document.createElement('div');
    el.setAttribute('data-testid', id);
    document.body.appendChild(el);
    return el;
}

describe('Pedido › aba Itens: uma lista só', () => {
    let barraItens: HTMLElement;
    let barraSalvar: HTMLElement;
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        barraItens = barra('barra-itens');
        barraSalvar = barra('barra-salvar');
    });

    it('sem a tabela "Itens avulsos"; o "+ Item avulso" fica na régua de "Itens do pedido"', async () => {
        montar(barraItens, barraSalvar);
        await waitFor(() => expect(within(barraItens).getByRole('button', { name: /Item avulso/ })).toBeTruthy());
        expect(screen.queryByText('Itens avulsos')).toBeNull();
        // A seleção do orçamento continua — é dela que vêm os itens do orçamento.
        expect(await screen.findByText(/Seleção de materiais da obra/i)).toBeTruthy();
    });

    it('incluir avulso grava na hora, sobre os itens lidos do servidor, e avisa o detalhe', async () => {
        const { onSave } = montar(barraItens, barraSalvar);
        fireEvent.click(await within(barraItens).findByRole('button', { name: /Item avulso/ }));

        fireEvent.change(screen.getByPlaceholderText('Descrição do material ou serviço'), { target: { value: 'Tábua 20' } });
        const unidade = screen.getAllByRole('combobox').find(s => within(s).queryByText('Selecione...'))!;
        fireEvent.change(unidade, { target: { value: 'un' } });
        fireEvent.click(screen.getByRole('button', { name: /Adicionar Item/ }));

        await waitFor(() => expect(orderService.updateOrder).toHaveBeenCalled());
        const [id, patch, versao] = vi.mocked(orderService.updateOrder).mock.calls[0];
        expect(id).toBe('ord-1');
        expect(versao).toBe(3);
        expect(Object.keys(patch)).toEqual(['items']);
        expect(patch.items!.map((i: { code: string; description: string }) => i.description)).toEqual(['Concreto usinado', 'Cimento CP-II', 'Tábua 20']);
        expect(patch.items![2]).toMatchObject({ unit: 'un', quantity: 1, avulso: true });
        expect(onSave).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByPlaceholderText('Descrição do material ou serviço')).toBeNull());
    });

    it('o detalhe gravou um item: o "Salvar alterações" seguinte manda a lista nova com a versão nova', async () => {
        const { regravar } = montar(barraItens, barraSalvar);
        const salvar = await within(barraSalvar).findByRole('button', { name: /Salvar alterações/ });
        await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));

        // Ex.: excluiu o avulso na tabela "Itens do pedido" → versão 5, só o item do orçamento.
        regravar(5, [ITENS_V3[0]]);
        await new Promise(r => setTimeout(r, 30));
        fireEvent.click(salvar);

        await waitFor(() => expect(orderService.updateOrder).toHaveBeenCalled());
        const [, patch, versao] = vi.mocked(orderService.updateOrder).mock.calls[0];
        expect(versao).toBe(5);
        expect(patch.items!.map((i: { code: string }) => i.code)).toEqual(['ORC-1']);
    });
});
