// @vitest-environment jsdom
/**
 * Suprimentos › Pedidos de Compra › Preferências → formulário do pedido NOVO (10/11/2026).
 *
 * Pedido do usuário: "algumas coisas funcionaram e outras, por exemplo forma de
 * pagamento eu escolhi PIX e veio boleto, verifique todos".
 *
 * Cada campo das Preferências tem de chegar ao formulário, e nada do que o
 * formulário faz sozinho depois (endereço da obra, troca de obra) pode passar
 * por cima do padrão ou do que o usuário digitou.
 * Plano: docs/planos/2026-11-09-pedido-compra-preferencias.md
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { PadroesDoPedido } from '../../lib/pedidoPreferencias';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const ENDERECO = { street: 'Rua Coronel Lambert', number: '345', neighborhood: 'Centro', city: 'Cambuí', state: 'MG' };
const OBRAS = [
    { id: 'obra-1', name: 'Obra Alfa', organization_id: 'org-1', settings: ENDERECO },
    { id: 'obra-2', name: 'Obra da SPE', organization_id: 'org-2', settings: {} },
];

let padroes: Record<string, { empresa: PadroesDoPedido; pessoal: PadroesDoPedido }> = {};

vi.mock('../../services/pedidoPreferenciasService', () => ({
    pedidoPreferenciasService: {
        ler: vi.fn(async (orgId: string) => padroes[orgId] ?? { empresa: {}, pessoal: {} }),
    },
}));
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => []) },
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
        list: vi.fn(async () => [{ id: 'emp-a', name: 'Empreendimento A' }, { id: 'emp-b', name: 'Empreendimento B' }]),
        mapObrasToEmpreendimentos: vi.fn(async () => ({
            'obra-1': { id: 'emp-a', name: 'Empreendimento A' },
            'obra-2': { id: 'emp-b', name: 'Empreendimento B' },
        })),
    },
}));
vi.mock('../../services/budgetResolver', () => ({ resolveProjectBudget: vi.fn(async () => ({ budget: [] })) }));
vi.mock('../../services/orderService', () => ({
    orderService: { listOrders: vi.fn(async () => []), createOrder: vi.fn(async () => ({})) },
}));
vi.mock('../../services/sinapiService', () => ({ sinapiService: { getItemsByCodes: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listPaymentAccounts: vi.fn(async () => [{ id: 'conta-1', name: 'Asaas' }, { id: 'conta-2', name: 'Sicredi' }]),
        listPlanoContas: vi.fn(async () => []),
    },
}));
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/orderNumberRegenService', () => ({
    getOrderNumberLockReason: vi.fn(async () => null),
    regenerateOrderNumber: vi.fn(async () => 'X'),
}));

let orgDoTopo: string | null = 'org-1';
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: orgDoTopo }) }));

// Drawers: só mostram o valor recebido — é o que interessa aqui.
vi.mock('../../components/SupplierSelect', () => ({ default: () => <div /> }));
vi.mock('../../components/CostCenterSelect', () => ({
    default: ({ value }: { value: string }) => <div data-testid="centro-de-custo">{value}</div>,
}));
vi.mock('../../components/PlanoContasSelect', () => ({
    default: ({ value }: { value: string }) => <div data-testid="plano-de-contas">{value}</div>,
}));
vi.mock('../../components/MaterialSelectionModal', () => ({ default: () => null }));
vi.mock('../../components/DatabasePickerModal', () => ({ default: () => null }));

import SupplyChainOrderForm from '../../components/SupplyChainOrderForm';
import { ConfirmProvider } from '../../components/ui/confirm';

function montar() {
    render(
        <ConfirmProvider>
            <SupplyChainOrderForm onBack={() => {}} onSave={() => {}} />
        </ConfirmProvider>
    );
}

/** Campo pelo rótulo visível (os rótulos do formulário não usam htmlFor). */
function campo(rotulo: string): HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement {
    const label = screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL');
    if (!label) throw new Error(`rótulo "${rotulo}" não encontrado`);
    const el = label.parentElement!.querySelector('input, select, textarea');
    if (!el) throw new Error(`campo de "${rotulo}" não encontrado`);
    return el as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
}

const hojeMais = (dias: number) => {
    const h = new Date();
    const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Pedido novo recebe as Preferências', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        orgDoTopo = 'org-1';
        padroes = {};
    });

    it('os doze campos chegam ao formulário (empresa + meu padrão)', async () => {
        padroes['org-1'] = {
            empresa: {
                paymentMethod: 'Pix',
                deliveryMethod: 'FOB - Retirada por conta do comprador',
                paymentAccountId: 'conta-1',
                costCenterId: 'cc-1',
                planoDeContasId: 'pc-1',
                notes: 'Entregar no portão lateral',
                notesVisibleToSupplier: false,
            },
            pessoal: {
                paymentTermType: 'Parcelado',
                paymentDays: 45,
                paymentInstallments: 3,
                deliveryLocation: 'Almoxarifado Central',
                prazoEntregaDias: 10,
            },
        };
        montar();

        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Pix'));
        expect(campo('Forma de Entrega').value).toBe('FOB - Retirada por conta do comprador');
        expect(campo('Local de Entrega').value).toBe('Almoxarifado Central');
        expect(campo('Data de Entrega').value).toBe(hojeMais(10));
        expect(campo('Notas / Observações').value).toBe('Entregar no portão lateral');
        expect((screen.getByLabelText(/Visível para o fornecedor/) as HTMLInputElement).checked).toBe(false);
        expect(campo('Conta de Pagamento').value).toBe('Asaas');
        expect(screen.getByTestId('centro-de-custo').textContent).toBe('cc-1');
        expect(screen.getByTestId('plano-de-contas').textContent).toBe('pc-1');
        expect(campo('Quantidade de Parcelas').value).toBe('3');
        expect(screen.getByText(/Preenchido com/).textContent).toMatch(/seu padrão e padrão da empresa|padrão da empresa e seu padrão/);

        // Condição à vista com o prazo do padrão.
        fireEvent.click(screen.getByRole('button', { name: 'À Vista' }));
        expect(campo('Prazo de Pagamento (Dias)').value).toBe('45');
    });

    it('escolher a obra NÃO troca o local de entrega que veio das Preferências pelo endereço da obra', async () => {
        padroes['org-1'] = { empresa: { deliveryLocation: 'Almoxarifado Central', paymentMethod: 'Pix' }, pessoal: {} };
        montar();
        await waitFor(() => expect(campo('Local de Entrega').value).toBe('Almoxarifado Central'));

        fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });

        // O carregamento da obra é assíncrono: dá tempo de ele rodar antes de conferir.
        await waitFor(() => expect(campo('Obra').value).toBe('obra-1'));
        await new Promise(r => setTimeout(r, 50));
        expect(campo('Local de Entrega').value).toBe('Almoxarifado Central');
        expect(campo('Forma de Pagamento').value).toBe('Pix');
    });

    it('sem local nas Preferências, a obra continua preenchendo o endereço dela', async () => {
        padroes['org-1'] = { empresa: { paymentMethod: 'Pix' }, pessoal: {} };
        montar();
        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Pix'));

        fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });

        await waitFor(() => expect(campo('Local de Entrega').value).toBe('Rua Coronel Lambert, 345, Centro - Cambuí/MG'));
    });

    it('local digitado à mão continua depois de escolher a obra', async () => {
        montar();
        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Boleto'));

        fireEvent.change(campo('Local de Entrega'), { target: { value: 'Galpão 2' } });
        fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });

        await waitFor(() => expect(campo('Obra').value).toBe('obra-1'));
        await new Promise(r => setTimeout(r, 50));
        expect(campo('Local de Entrega').value).toBe('Galpão 2');
    });

    it('forma de pagamento escolhida à mão não volta ao padrão quando a obra muda', async () => {
        padroes['org-1'] = { empresa: { paymentMethod: 'Pix' }, pessoal: {} };
        montar();
        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Pix'));

        fireEvent.change(campo('Forma de Pagamento'), { target: { value: 'Dinheiro' } });
        fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });

        await waitFor(() => expect(campo('Obra').value).toBe('obra-1'));
        await new Promise(r => setTimeout(r, 50));
        expect(campo('Forma de Pagamento').value).toBe('Dinheiro');
    });

    it('topo em "Todas": os padrões entram assim que a obra é escolhida', async () => {
        orgDoTopo = null;
        padroes['org-1'] = { empresa: { paymentMethod: 'Pix' }, pessoal: {} };
        montar();
        await waitFor(() => expect(screen.getByText(/escolher a obra/i)).toBeTruthy());
        expect(campo('Forma de Pagamento').value).toBe('Boleto');

        fireEvent.change(campo('Obra'), { target: { value: 'obra-1' } });

        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Pix'));
    });

    it('obra de uma empresa SEM padrão: a tela avisa, em vez de trocar calada para o padrão do sistema', async () => {
        padroes['org-1'] = { empresa: { paymentMethod: 'Pix' }, pessoal: {} };
        montar();
        await waitFor(() => expect(campo('Forma de Pagamento').value).toBe('Pix'));

        fireEvent.change(campo('Obra'), { target: { value: 'obra-2' } });

        await waitFor(() => expect(screen.getByText(/não tem padrão/i)).toBeTruthy());
        // O padrão é por empresa: o Pix era o da outra — volta ao do sistema, agora dito na tela.
        expect(campo('Forma de Pagamento').value).toBe('Boleto');
        expect(screen.queryByText(/Preenchido com/)).toBeNull();
    });
});
