// @vitest-environment jsdom
/**
 * Portal do Cliente — entradas da central de ajuda e do tour.
 * 14/10/2026, docs/planos/2026-10-14-ajuda-tour-portal-cliente.md
 *
 * O que trava (o mesmo do Fornecedor, SupplierPortalAjuda.test.tsx):
 *   1. LINK: botão "?" no header e item "Ajuda" no menu da conta abrem o painel
 *      (era um toast "Dúvidas? Fale com a construtora…");
 *   2. a ajuda lê a casca do token (client_portal_help_get) e só mostra as
 *      seções das abas liberadas;
 *   3. no celular a barra inferior tem "Mais" SEMPRE, com "Ajuda" dentro;
 *   4. o link real chega com portalToken E isPreview (App.tsx) e mesmo assim
 *      não é prévia — a prévia do gestor (isPreview sem token) não abre nada;
 *   5. cliente LOGADO (sem a casca do link) também tem o "?".
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getByToken = vi.fn();
const getMine = vi.fn(async () => ({ orgs: [], help: null }));
vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: {
    getByToken: (...a: unknown[]) => getByToken(...a),
    getMine: (...a: unknown[]) => getMine(...a),
    markTour: vi.fn(async () => undefined),
  },
}));

// Serviço "qualquer método devolve lista vazia" — o portal só precisa montar.
// (vi.hoisted: as fábricas de vi.mock sobem para o topo do arquivo)
const { servicoVazio } = vi.hoisted(() => ({
  servicoVazio: () => new Proxy({}, {
    get: (_alvo, nome) => (nome === 'then' ? undefined : vi.fn(async () => [])),
  }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
vi.mock('../../services/clientService', () => ({ clientService: servicoVazio() }));
vi.mock('../../services/clientRequestsService', () => ({ clientRequestsService: servicoVazio() }));
vi.mock('../../services/clientMessagesService', () => ({ clientMessagesService: servicoVazio() }));
vi.mock('../../services/exportService', () => ({ exportService: servicoVazio() }));
vi.mock('../../services/financialReceiptService', () => ({ financialReceiptService: servicoVazio() }));
vi.mock('../../services/commercialFinanceService', () => ({ commercialFinanceService: servicoVazio() }));
vi.mock('../../services/contractService', () => ({ contractService: servicoVazio() }));
vi.mock('../../services/documentService', () => ({ documentService: servicoVazio() }));
vi.mock('../../services/projectService', () => ({ projectService: servicoVazio() }));
vi.mock('../../services/orderService', () => ({ orderService: servicoVazio() }));
vi.mock('../../services/clientPortalService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/clientPortalService')>()),
  clientPortalService: servicoVazio(),
}));
vi.mock('../../components/ProjectGallery', () => ({ default: () => null }));
vi.mock('../../components/FinishSelection', () => ({ default: () => null }));
vi.mock('../../components/ClientList', () => ({ default: () => null }));
vi.mock('../../components/AIInsightCard', () => ({ default: () => null }));
vi.mock('../../components/MobilePreviewFrame', () => ({ default: () => null }));
vi.mock('../../components/client/ClientPortalLinkModal', () => ({ default: () => null }));
vi.mock('../../components/client/portal/ClientPortalMyData', () => ({ default: () => null }));

import { ClientArea } from '../../components/ClientArea';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { Client, ProjectSettings } from '../../types';

const SETTINGS = { name: '', location: '', standard: '', cubRate: 0, area: 0, bdi: 0, ls: 0, database: '', referenceMonth: '', socialChargesMode: '', wbs: [] } as unknown as ProjectSettings;

function montar(tabs: string[], extra: { isPreview?: boolean; portalToken?: string; profile?: { group: string; role: string } } = { portalToken: 'tok-cli', isPreview: true }) {
  const cliente = { id: 'cli1', name: 'Maria Souza', email: 'maria@x.com', portalTabs: tabs } as unknown as Client;
  render(
    <ConfirmProvider>
      <ClientArea settings={SETTINGS} budget={[]} profile={extra.profile ?? { group: 'CLIENTE', role: '' }} clientProfile={cliente}
        organizationId="org1" portalToken={extra.portalToken} isPreview={extra.isPreview} onClientSelect={() => {}} />
    </ConfirmProvider>,
  );
}

const barra = () => document.querySelector('.md\\:hidden.fixed.bottom-0') as HTMLElement;
// o Sheet aninha dois role=dialog; o painel da ajuda é o que tem o subtítulo
const painelAjuda = async () => (await screen.findByText(/Portal do Cliente · como usar/)).closest('[role="dialog"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getByToken.mockResolvedValue({
    org_id: 'org1',
    contact: { name: 'Alpa', email: 'atendimento@alpa.com', phone: null, website: null },
    items: [],
    seen: [{ tour_id: 'geral', status: 'concluido' }],
  });
});

describe('Portal do Cliente › ajuda', () => {
  it('link real (portalToken E isPreview): a ajuda é lida na montagem para decidir o tour — não é prévia do gestor', async () => {
    montar(['dashboard', 'documentos']);
    await waitFor(() => expect(getByToken).toHaveBeenCalledWith('cliente', 'tok-cli'));
  });

  it('prévia do gestor (isPreview sem token): nada abre nem é lido sozinho', async () => {
    montar(['dashboard', 'documentos'], { isPreview: true });
    await new Promise(r => setTimeout(r, 100));
    expect(getMine).not.toHaveBeenCalled();
    expect(getByToken).not.toHaveBeenCalled();
  });

  it('botão "?" do header abre a central, só com as seções liberadas e o contato da construtora', async () => {
    const user = userEvent.setup();
    montar(['dashboard', 'financeiro']);
    await user.click(await screen.findByRole('button', { name: 'Abrir a ajuda do portal' }));
    const painel = await painelAjuda();
    await within(painel).findByRole('button', { name: 'Financeiro' });
    expect(within(painel).getByRole('button', { name: 'Geral' })).toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Manutenção' })).not.toBeInTheDocument();
    expect(within(painel).getByRole('heading', { name: 'Falar com Alpa' })).toBeInTheDocument();
  });

  it('o item do menu da conta chama-se "Ajuda" e abre o painel (não há mais toast)', async () => {
    const user = userEvent.setup();
    montar(['dashboard', 'documentos']);
    await user.click(await screen.findByRole('button', { name: /\(CLIENTE\)/ }));
    expect(screen.queryByRole('menuitem', { name: 'Ajuda e comandos' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Ajuda' }));
    expect(await painelAjuda()).toBeInTheDocument();
    expect(screen.queryByText(/Fale com a construtora responsável/)).not.toBeInTheDocument();
  });

  it('celular: com 5 abas a barra tem 4 abas + "Mais", e o sheet traz a 5ª aba e "Ajuda"', async () => {
    const user = userEvent.setup();
    montar(['dashboard', 'obra', 'documentos', 'financeiro', 'manutencao']);
    await screen.findByRole('button', { name: 'Abrir a ajuda do portal' });
    const b = barra();
    expect(within(b).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Dashboard', 'Obra', 'Documentos', 'Financeiro', 'Mais']);
    await user.click(within(b).getByRole('button', { name: 'Mais' }));
    const sheet = screen.getByText('Mais opções').parentElement!;
    expect(within(sheet).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Manutenção', 'Ajuda']);
    await user.click(within(sheet).getByRole('button', { name: /^Ajuda$/i }));
    expect(await painelAjuda()).toBeInTheDocument();
  });

  it('celular: com 2 abas o "Mais" continua lá, só com "Ajuda" dentro', async () => {
    const user = userEvent.setup();
    montar(['dashboard', 'documentos']);
    await screen.findByRole('button', { name: 'Abrir a ajuda do portal' });
    const b = barra();
    expect(within(b).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Dashboard', 'Documentos', 'Mais']);
    await user.click(within(b).getByRole('button', { name: 'Mais' }));
    const sheet = screen.getByText('Mais opções').parentElement!;
    expect(within(sheet).getAllByRole('button').map(x => x.textContent?.trim())).toEqual(['Ajuda']);
  });

  it('cliente logado (sem link): o "?" fica no título e a ajuda é lida pelo e-mail (get_mine), na organização do cliente', async () => {
    const user = userEvent.setup();
    getMine.mockResolvedValue({ orgs: [{ id: 'org1', name: 'Alpa' }], help: { org_id: 'org1', contact: null, items: [], seen: [{ tour_id: 'geral', status: 'concluido' }] } } as never);
    montar(['dashboard', 'documentos'], {});
    await user.click(await screen.findByRole('button', { name: 'Abrir a ajuda do portal' }));
    await waitFor(() => expect(getMine).toHaveBeenCalledWith('cliente', 'org1'));
    expect(getByToken).not.toHaveBeenCalled();
    expect(await painelAjuda()).toBeInTheDocument();
  });
});
