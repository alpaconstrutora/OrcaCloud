// @vitest-environment jsdom
/**
 * Suprimentos › Pedidos › "Novo pedido" — itens (10/11/2026).
 *
 * Pedido do usuário: a "Seleção de materiais da obra" ficava sempre aberta —
 * "é melhor ficar oculto e como em adicionar itens avulsos, criar um botão
 * adicionar item do orçamento e então abre-se modal". Valeu "nos dois"
 * (detalhe do pedido e Novo pedido). No Novo pedido, a lista "Itens avulsos"
 * virou "Itens do pedido" (orçamento + avulsos), e nada grava antes de criar.
 * Plano: docs/planos/2026-11-10-pedido-item-do-orcamento-painel.md
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const OBRAS = [{ id: 'obra-1', name: 'Obra Alfa', organization_id: 'org-1', settings: {} }];
const ORCAMENTO = [
    { id: 'b1', quantity: 8, sinapiItem: { code: 'ORC-2', description: 'Brita 1', unit: 'M3', price: 30, type: 'INPUT' } },
    { id: 'b2', quantity: 3, sinapiItem: {
        code: 'COMP-1', description: 'Piso em taco', unit: 'M2', price: 350, type: 'COMPOSITION',
        composition: [{ code: 'INS-A', description: 'Taco de madeira', unit: 'M2', price: 120, type: 'INPUT', quantity: 2 }],
    } },
];

vi.mock('../../services/pedidoPreferenciasService', () => ({
    pedidoPreferenciasService: { ler: vi.fn(async () => ({ empresa: {}, pessoal: {} })) },
}));
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
        listOrders: vi.fn(async () => []),
        getOrderById: vi.fn(async () => null),
        updateOrder: vi.fn(async () => ({ version: 1 })),
        createOrder: vi.fn(async () => ({ id: 'novo' })),
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
// Seletor de fornecedor com drawer próprio: aqui, um botão que escolhe o único.
vi.mock('../../components/SupplierSelect', () => ({
    default: ({ onChange }: { onChange: (id: string) => void }) => <button type="button" onClick={() => onChange('forn-1')}>escolher fornecedor</button>,
}));
vi.mock('../../components/CostCenterSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/PlanoContasSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/DatabasePickerModal', () => ({ default: () => null }));

import { orderService } from '../../services/orderService';
import SupplyChainOrderForm from '../../components/SupplyChainOrderForm';
import { ConfirmProvider } from '../../components/ui/confirm';

function campo(rotulo: string): HTMLSelectElement {
    const label = screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL');
    if (!label) throw new Error(`rótulo "${rotulo}" não encontrado`);
    return label.parentElement!.querySelector('select, input') as HTMLSelectElement;
}

async function abrirComObra() {
    render(
        <ConfirmProvider>
            <SupplyChainOrderForm onBack={() => {}} onSave={() => {}} />
        </ConfirmProvider>
    );
    await waitFor(() => expect(campo('Obra').querySelector('option[value="obra-1"]')).toBeTruthy());
    fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });
    return await screen.findByRole('button', { name: /Item do orçamento/ });
}

const linhaDaLista = (texto: string) => {
    const tabela = screen.getByText('Itens do pedido').closest('.overflow-hidden')!;
    return within(tabela as HTMLElement).getByText(texto).closest('tr')!;
};

describe('Novo pedido › Itens do pedido', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('sem a "Seleção de materiais da obra": o item vem pelo painel e aparece em "Itens do pedido", sem gravar', async () => {
        const botao = await abrirComObra();
        await new Promise(r => setTimeout(r, 30));
        expect(screen.queryByText(/Seleção de materiais da obra/i)).toBeNull();
        expect(screen.getByText('Nenhum item no pedido')).toBeTruthy();

        fireEvent.click(botao);
        fireEvent.click(within((await screen.findByText('Taco de madeira')).closest('tr')!).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 item/ }));

        await waitFor(() => expect(screen.queryByText('Itens do orçamento da obra')).toBeNull());
        const linha = linhaDaLista('Taco de madeira');
        expect(within(linha).getByText('Orçamento')).toBeTruthy();
        expect(within(linha).getByText('6')).toBeTruthy();
        expect(orderService.updateOrder).not.toHaveBeenCalled();
        expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it('a tela do orçamento entra no lugar da lista; "Voltar" devolve a lista sem incluir nada', async () => {
        fireEvent.click(await abrirComObra());
        expect(await screen.findByText('Itens do orçamento da obra')).toBeTruthy();
        expect(screen.queryByText('Nenhum item no pedido')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Voltar para Itens do pedido' }));
        await waitFor(() => expect(screen.getByText('Nenhum item no pedido')).toBeTruthy());
        expect(screen.queryByText('Itens do orçamento da obra')).toBeNull();
    });

    it('editar item do orçamento: descrição travada, quantidade muda; excluir tira da lista', async () => {
        fireEvent.click(await abrirComObra());
        fireEvent.click(within((await screen.findByText('Brita 1')).closest('tr')!).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 item/ }));
        await waitFor(() => expect(screen.queryByText('Itens do orçamento da obra')).toBeNull());

        fireEvent.click(within(linhaDaLista('Brita 1')).getAllByRole('button')[0]);
        const descricao = screen.getByPlaceholderText('Descrição do material ou serviço') as HTMLInputElement;
        expect(descricao.readOnly).toBe(true);
        expect(screen.getByText(/vêm do orçamento da obra/)).toBeTruthy();
        const quantidade = screen.getAllByRole('spinbutton').find(i => (i as HTMLInputElement).value === '8')!;
        fireEvent.change(quantidade, { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/ }));

        await waitFor(() => expect(within(linhaDaLista('Brita 1')).getByText('5')).toBeTruthy());
        fireEvent.click(within(linhaDaLista('Brita 1')).getAllByRole('button')[1]);
        await waitFor(() => expect(screen.getByText('Nenhum item no pedido')).toBeTruthy());
    });

    it('criar o pedido leva o item escolhido no painel', async () => {
        fireEvent.click(await abrirComObra());
        fireEvent.click(within((await screen.findByText('Brita 1')).closest('tr')!).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 item/ }));
        await waitFor(() => expect(screen.queryByText('Itens do orçamento da obra')).toBeNull());

        fireEvent.click(screen.getByText('escolher fornecedor'));
        fireEvent.change(campo('Data de Entrega'), { target: { value: '2026-12-01' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar Pedido/ }));

        await waitFor(() => expect(orderService.createOrder).toHaveBeenCalled());
        const pedido = vi.mocked(orderService.createOrder).mock.calls[0][0] as { items: { code: string; quantity: number; unitPrice: number }[] };
        expect(pedido.items).toEqual([expect.objectContaining({ code: 'ORC-2', quantity: 8, unitPrice: 30 })]);
    });
});
