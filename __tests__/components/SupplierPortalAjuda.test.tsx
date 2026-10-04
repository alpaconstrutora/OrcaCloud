// @vitest-environment jsdom
/**
 * Portal do Fornecedor (LINK) — entradas da central de ajuda.
 * F2 (04/10/2026), docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. botão "?" no header e item "Ajuda" no menu da conta abrem o painel
 *      (era um toast de 4 s);
 *   2. no celular a barra inferior tem "Mais" SEMPRE — mesmo com ≤ 5 abas —
 *      porque é por ele que se chega à Ajuda (o header é só md+); 4 abas na
 *      barra, o resto + "Ajuda" no sheet;
 *   3. a ajuda lê a casca do token (supplier_portal_help_get) e só mostra as
 *      seções das abas liberadas.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getByToken = vi.fn();
vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: { getByToken: (...a: unknown[]) => getByToken(...a), getMine: vi.fn() },
}));
vi.mock('../../services/supplierPortalTokenService', () => ({
  supplierPortalTokenService: {
    getOrders: vi.fn(async () => []), getInvoices: vi.fn(async () => []), getQuotations: vi.fn(async () => []),
    getBankAccounts: vi.fn(async () => []), updateOrderLogistics: vi.fn(),
  },
}));
vi.mock('../../services/supplierAiService', () => ({ supplierAiService: { generateInsights: vi.fn(async () => []), getInsights: vi.fn(async () => []), getSupplyForecast: vi.fn(async () => null) } }));
vi.mock('../../services/orderService', () => ({ orderService: { getOrders: vi.fn(async () => []), listOrders: vi.fn(async () => []) } }));
vi.mock('../../services/quotationService', () => ({ quotationService: { getQuotations: vi.fn(async () => []), listQuotations: vi.fn(async () => []) } }));
vi.mock('../../services/invoiceService', () => ({ invoiceService: { getInvoices: vi.fn(async () => []), listInvoices: vi.fn(async () => []) } }));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: vi.fn(async () => null), getSettings: vi.fn(async () => null) } }));
vi.mock('../../services/supplierService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/supplierService')>()),
  supplierService: { getSuppliers: vi.fn(async () => []), listSuppliers: vi.fn(async () => []), updateSupplier: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
vi.mock('../../components/supplier/portal/PortalOverview', () => ({ default: () => <div data-testid="PortalOverview" /> }));
vi.mock('../../components/supplier/portal/PortalOrders', () => ({ default: () => null }));
vi.mock('../../components/supplier/portal/PortalQuotations', () => ({ default: () => null }));
vi.mock('../../components/supplier/portal/PortalNegotiations', () => ({ default: () => null }));
vi.mock('../../components/supplier/portal/PortalInvoices', () => ({ default: () => null }));
vi.mock('../../components/supplier/portal/PortalFinanceiro', () => ({ default: () => null }));
vi.mock('../../components/supplier/portal/PortalMyData', () => ({ default: () => null }));
vi.mock('../../components/supplier/SupplierFinanceiroTab', () => ({ default: () => null }));
vi.mock('../../components/NegotiationHub', () => ({ default: () => null }));
vi.mock('../../components/InvoiceManager', () => ({ default: () => null }));
vi.mock('../../components/SupplyChainOrderDetails', () => ({ default: () => null }));
vi.mock('../../components/QuotationResponseForm', () => ({ default: () => null }));
vi.mock('../../components/AIInsightCard', () => ({ default: () => null }));
vi.mock('../../components/OrderLifeline', () => ({ default: () => null }));
vi.mock('../../components/RepuScore', () => ({ default: () => null }));
vi.mock('../../components/MobilePreviewFrame', () => ({ default: () => null }));

import SupplierDashboard from '../../components/SupplierDashboard';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { Supplier } from '../../types';

const TODAS = ['overview', 'negotiations', 'quotations', 'orders', 'documents', 'financeiro'];

function montar(tabs: string[]) {
  const supplier = { id: 'sup1', name: 'Ferragens Beta', email: 'beta@x.com', settings: { supplierPortalTabs: tabs } } as unknown as Supplier;
  render(<ConfirmProvider><SupplierDashboard supplierProfile={supplier} portalToken="tok-forn" /></ConfirmProvider>);
}

const barra = () => document.querySelector('.md\\:hidden.fixed.bottom-0') as HTMLElement;

// o Sheet aninha dois role=dialog; o painel da ajuda é o que tem o subtítulo
const painelAjuda = async () => (await screen.findByText(/Portal do Fornecedor · como usar/)).closest('[role="dialog"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getByToken.mockResolvedValue({
    org_id: 'org1',
    contact: { name: 'Alpa', email: 'compras@alpa.com', phone: null, website: null },
    items: [],
  });
});

describe('Portal do Fornecedor › ajuda', () => {
  it('botão "?" do header abre a central lendo a casca do token, só com as seções liberadas', async () => {
    const user = userEvent.setup();
    montar(['overview', 'orders']);
    await user.click(await screen.findByRole('button', { name: 'Abrir a ajuda do portal' }));
    await waitFor(() => expect(getByToken).toHaveBeenCalledWith('fornecedor', 'tok-forn'));
    const painel = await painelAjuda();
    await within(painel).findByRole('button', { name: 'Pedidos' });
    expect(within(painel).getByRole('button', { name: 'Geral' })).toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Cotações' })).not.toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Abrir uma solicitação' })).not.toBeInTheDocument();
    expect(within(painel).getByRole('heading', { name: 'Falar com Alpa' })).toBeInTheDocument();
  });

  it('o item do menu da conta chama-se "Ajuda" e abre o painel (não há mais toast)', async () => {
    const user = userEvent.setup();
    montar(TODAS);
    await user.click(await screen.findByRole('button', { name: /\(FORNECEDOR\)/ }));
    expect(screen.queryByRole('menuitem', { name: 'Ajuda e comandos' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Ajuda' }));
    expect(await painelAjuda()).toBeInTheDocument();
    expect(screen.queryByText(/Fale com a construtora responsável/)).not.toBeInTheDocument();
  });

  it('celular: com 5 abas a barra ainda tem "Mais" (4 abas + Mais) e o sheet traz a 5ª aba e "Ajuda"', async () => {
    const user = userEvent.setup();
    montar(['overview', 'negotiations', 'quotations', 'orders', 'financeiro']);
    await screen.findByRole('button', { name: 'Abrir a ajuda do portal' });
    const b = barra();
    const rotulos = within(b).getAllByRole('button').map(x => x.textContent?.trim());
    expect(rotulos).toEqual(['Estatísticas', 'Lances', 'Cotações', 'Pedidos', 'Mais']);
    await user.click(within(b).getByRole('button', { name: 'Mais' }));
    const sheet = screen.getByText('Mais opções').parentElement!;
    expect(within(sheet).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Financeiro', 'Ajuda']);
    await user.click(within(sheet).getByRole('button', { name: /^Ajuda$/i }));
    expect(await painelAjuda()).toBeInTheDocument();
    expect(screen.queryByText('Mais opções')).not.toBeInTheDocument();
  });

  it('celular: com 2 abas o "Mais" continua lá, só com "Ajuda" dentro', async () => {
    const user = userEvent.setup();
    montar(['overview', 'orders']);
    await screen.findByRole('button', { name: 'Abrir a ajuda do portal' });
    const b = barra();
    expect(within(b).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Estatísticas', 'Pedidos', 'Mais']);
    await user.click(within(b).getByRole('button', { name: 'Mais' }));
    const sheet = screen.getByText('Mais opções').parentElement!;
    expect(within(sheet).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Ajuda']);
  });
});
