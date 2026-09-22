// @vitest-environment jsdom
/**
 * Suprimentos › Pedidos › detalhe do pedido › aba "Dados Gerais" (22/09/2026).
 *
 * Pedido do usuário: "alterei o empreendimento de um pedido, porem o botao
 * salvar alteracoes nao ficou disponivel".
 *
 * O empreendimento NÃO é campo do pedido — o pedido pendura na OBRA e o
 * empreendimento é derivado dela. O seletor limpava a obra sempre que ela não
 * fosse do empreendimento escolhido, e o "Salvar alterações" (que exige obra)
 * desligava sem dizer nada. Estes casos travam o conserto:
 *
 *   1. empreendimento com UMA obra escolhe a obra sozinho e o botão continua
 *      disponível (é o caso de todos os empreendimentos do banco hoje);
 *   2. empreendimento SEM obra não é escolhível — seria beco sem saída;
 *   3. com mais de uma obra, a tela DIZ o que falta em vez de só desbotar.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const OBRAS = [
    { id: 'obra-1', name: 'Obra Alfa', settings: {} },
    { id: 'obra-2', name: 'Obra Beta', settings: {} },
    { id: 'obra-3', name: 'Obra Beta II', settings: {} },
];

// obra-1 → Empreendimento A (uma obra). obra-2 e obra-3 → Empreendimento B
// (duas). Empreendimento C não tem obra nenhuma.
let mapaObraEmpreendimento: Record<string, { id: string; name: string }> = {
    'obra-1': { id: 'emp-a', name: 'Empreendimento A' },
    'obra-2': { id: 'emp-b', name: 'Empreendimento B' },
    'obra-3': { id: 'emp-b', name: 'Empreendimento B' },
};

// O orçamento de cada obra. obra-1 tem o item ORC-1; obra-2 não tem nenhum —
// é o que faz o item do orçamento "sumir" ao trocar de obra se ninguém o
// preservar.
const ORCAMENTOS: Record<string, { id: string; quantity: number; sinapiItem: { code: string; description: string; unit: string; price: number } }[]> = {
    'obra-1': [{ id: 'b1', quantity: 5, sinapiItem: { code: 'ORC-1', description: 'Concreto usinado', unit: 'M3', price: 500 } }],
    'obra-2': [],
    'obra-3': [],
};

const PEDIDO_BASE = {
    id: 'ord-1',
    number: 'PC-A-001',
    projectId: 'obra-1',
    supplierId: 'forn-1',
    deliveryDate: '2026-10-01',
    status: 'Rascunho',
    version: 3,
    items: [
        { code: 'ORC-1', description: 'Concreto usinado', unit: 'M3', quantity: 5, unitPrice: 500, total: 2500 },
        { code: 'AV-1', description: 'Cimento CP-II', unit: 'SC', quantity: 10, unitPrice: 40, total: 400, avulso: true },
    ],
};

let pedidoAtual = PEDIDO_BASE;

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
        list: vi.fn(async () => [
            { id: 'emp-a', name: 'Empreendimento A' },
            { id: 'emp-b', name: 'Empreendimento B' },
            { id: 'emp-c', name: 'Empreendimento C' },
        ]),
        mapObrasToEmpreendimentos: vi.fn(async () => mapaObraEmpreendimento),
    },
}));
vi.mock('../../services/budgetResolver', () => ({
    resolveProjectBudget: vi.fn(async (p: { id: string }) => ({ budget: ORCAMENTOS[p.id] ?? [] })),
}));
vi.mock('../../services/orderService', () => ({
    orderService: {
        listOrders: vi.fn(async () => [pedidoAtual]),
        updateOrder: vi.fn(async () => ({ version: 4 })),
        createOrder: vi.fn(async () => ({})),
    },
}));
vi.mock('../../services/sinapiService', () => ({ sinapiService: { getItemsByCodes: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listPaymentAccounts: vi.fn(async () => []),
        listPlanoContas: vi.fn(async () => []),
    },
}));
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/orderNumberRegenService', () => ({
    getOrderNumberLockReason: vi.fn(async () => null),
    regenerateOrderNumber: vi.fn(async () => 'PC-A-002'),
}));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org-1' }) }));

// Seletores com drawer próprio (§7.1.1) e modais pesados: fora do escopo deste
// caso, e cada um traz a própria cadeia de serviços.
vi.mock('../../components/SupplierSelect', () => ({
    default: ({ value }: { value: string }) => <div data-testid="fornecedor">{value}</div>,
}));
vi.mock('../../components/CostCenterSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/PlanoContasSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/MaterialSelectionModal', () => ({ default: () => null }));
vi.mock('../../components/DatabasePickerModal', () => ({ default: () => null }));

import { orderService } from '../../services/orderService';
import SupplyChainOrderForm from '../../components/SupplyChainOrderForm';
import { ConfirmProvider } from '../../components/ui/confirm';

function montar() {
    render(
        <ConfirmProvider>
            <SupplyChainOrderForm embedded painel="dados" editingOrderId="ord-1" onBack={() => {}} onSave={() => {}} />
        </ConfirmProvider>
    );
}

const botaoSalvar = () => screen.getByRole('button', { name: /salvar alterações/i }) as HTMLButtonElement;
const seletor = (rotulo: RegExp) => screen.getByLabelText(rotulo) as HTMLSelectElement;

async function esperarPedidoCarregado() {
    await waitFor(() => expect(screen.getByDisplayValue('PC-A-001')).toBeTruthy());
    await waitFor(() => expect(seletor(/^Obra$/).value).toBe('obra-1'));
    // O item avulso só aparece depois do orçamento chegar (classificação).
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
}

describe('Pedido › Dados Gerais › trocar o empreendimento', () => {
    beforeEach(() => {
        pedidoAtual = PEDIDO_BASE;
        mapaObraEmpreendimento = {
            'obra-1': { id: 'emp-a', name: 'Empreendimento A' },
            'obra-2': { id: 'emp-b', name: 'Empreendimento B' },
            'obra-3': { id: 'emp-b', name: 'Empreendimento B' },
        };
    });

    it('empreendimento com uma obra só: a obra entra sozinha e o botão continua disponível', async () => {
        // Sem obra-3, o Empreendimento B tem exatamente uma obra — o caso de
        // todos os empreendimentos do banco em 22/09/2026.
        mapaObraEmpreendimento = {
            'obra-1': { id: 'emp-a', name: 'Empreendimento A' },
            'obra-2': { id: 'emp-b', name: 'Empreendimento B' },
        };
        montar();
        await esperarPedidoCarregado();
        expect(botaoSalvar().disabled).toBe(false);

        fireEvent.change(seletor(/Empreendimento/), { target: { value: 'emp-b' } });

        await waitFor(() => expect(seletor(/^Obra$/).value).toBe('obra-2'));
        expect(botaoSalvar().disabled).toBe(false);
    });

    it('empreendimento sem obra vinculada não é escolhível', async () => {
        montar();
        await esperarPedidoCarregado();

        const opcaoC = screen.getByRole('option', { name: /Empreendimento C \(sem obra vinculada\)/ }) as HTMLOptionElement;
        expect(opcaoC.disabled).toBe(true);
    });

    it('com mais de uma obra, a tela diz o que falta em vez de só desbotar o botão', async () => {
        montar();
        await esperarPedidoCarregado();

        fireEvent.change(seletor(/Empreendimento/), { target: { value: 'emp-b' } });

        await waitFor(() => expect(seletor(/^Obra$/).value).toBe(''));
        expect(botaoSalvar().disabled).toBe(true);
        expect(screen.getByText(/escolha qual recebe o pedido/i)).toBeTruthy();
        expect(screen.getByText('Falta escolher a obra.')).toBeTruthy();

        // E escolher a obra devolve o botão.
        fireEvent.change(seletor(/^Obra$/), { target: { value: 'obra-3' } });
        await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    });

    it('a obra da outra ponta leva junto os itens do orçamento antigo, como avulsos', async () => {
        // Empreendimento B com uma obra só (obra-2), cujo orçamento não tem o
        // ORC-1. `orderItems` só monta item de orçamento presente no orçamento
        // atual: sem preservar, o ORC-1 sumiria calado no salvar.
        mapaObraEmpreendimento = {
            'obra-1': { id: 'emp-a', name: 'Empreendimento A' },
            'obra-2': { id: 'emp-b', name: 'Empreendimento B' },
        };
        montar();
        await esperarPedidoCarregado();

        fireEvent.change(seletor(/Empreendimento/), { target: { value: 'emp-b' } });
        await waitFor(() => expect(seletor(/^Obra$/).value).toBe('obra-2'));

        fireEvent.click(botaoSalvar());

        await waitFor(() => expect(orderService.updateOrder).toHaveBeenCalled());
        const [, patch] = vi.mocked(orderService.updateOrder).mock.calls.at(-1)!;
        expect(patch.projectId).toBe('obra-2');
        const codigos = (patch.items ?? []).map(i => i.code).sort();
        expect(codigos).toEqual(['AV-1', 'ORC-1']);
        // Quantidade e preço intactos. A marca `avulso` é re-derivada ao abrir o
        // pedido (código fora do orçamento da obra = avulso), então ela pode não
        // estar gravada — o que não pode é o item sumir.
        expect((patch.items ?? []).find(i => i.code === 'ORC-1')).toMatchObject({
            quantity: 5, unitPrice: 500, total: 2500,
        });
    });

    it('"Todos os empreendimentos" é só filtro — não tira a obra do pedido', async () => {
        montar();
        await esperarPedidoCarregado();

        fireEvent.change(seletor(/Empreendimento/), { target: { value: '' } });

        expect(seletor(/^Obra$/).value).toBe('obra-1');
        expect(botaoSalvar().disabled).toBe(false);
    });
});
