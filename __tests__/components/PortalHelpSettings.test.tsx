// @vitest-environment jsdom
/**
 * Configurações › Ajuda dos Portais — o editor da construtora.
 * Pedido de 03/10/2026, docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. REGRA #5: com o topo em "Todas" a lista mostra a coluna Organização
 *      (padrão do sistema + o que cada org mudou) e gravar passa por
 *      resolveWriteOrg('all-allowed') + replicação por org;
 *   2. personalizar um padrão grava a sobrescrita pela chave (upsert);
 *   3. restaurar passa por useConfirm e apaga a linha;
 *   4. a pré-visualização do corpo é sanitizada.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ORGS = [{ id: 'org-a', name: 'Alpa' }, { id: 'org-b', name: 'Beta' }];
let orgIdDoTopo: string | null = null;
const resolveWriteOrg = vi.fn(async () => ({ kind: 'all' as const, orgIds: ['org-a', 'org-b'] }));

vi.mock('../../hooks/useOrgContext', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../hooks/useOrgContext')>();
  return {
    ...mod,
    useOrgContext: () => ({ orgId: orgIdDoTopo, companyId: null, source: orgIdDoTopo ? 'organization' : 'all' }),
    useWritableOrganizations: () => ORGS,
    useOrgWriteTarget: () => ({ resolveWriteOrg, orgTargetModal: null }),
  };
});

const list = vi.fn();
const saveOverride = vi.fn();
const createCustom = vi.fn();
const update = vi.fn();
const remove = vi.fn();
// pré-visualização: listas de quem vê cada portal
const listWorkspaces = vi.fn(async () => [{ id: 'ws1', supplier_name: 'Álvaro Esteves' }]);
vi.mock('../../services/partnerService', () => ({ partnerService: { listWorkspaces: (...a: unknown[]) => listWorkspaces(...a) } }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => []) } }));
vi.mock('../../services/brokerService', () => ({ brokerService: { listProfiles: vi.fn(async () => []) } }));
// o portal de verdade não carrega no teste: só provamos que a prévia o pede com o tour forçado
const portalDaPrevia = vi.fn();
vi.mock('../../components/partner/PartnerPortal', () => ({
  PartnerPortal: (props: Record<string, unknown>) => { portalDaPrevia(props); return <div>portal do parceiro em prévia</div>; },
}));

vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: {
    list: (...a: unknown[]) => list(...a),
    saveOverride: (...a: unknown[]) => saveOverride(...a),
    createCustom: (...a: unknown[]) => createCustom(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
    restoreAllDefaults: vi.fn(),
  },
}));

import PortalHelpSettings from '../../components/PortalHelpSettings';
import { ConfirmProvider } from '../../components/ui/confirm';
import { DEFAULT_ITEMS, TOURS } from '../../utils/portalHelpDefaults';

const primeiro = DEFAULT_ITEMS.parceiro.find(d => d.kind === 'artigo')!;
const SOBRESCRITA = {
  id: 'r1', organization_id: 'org-b', portal: 'parceiro', kind: 'artigo', default_key: primeiro.key, section: primeiro.section,
  title: 'Versão da Beta', body_html: '<p>beta</p>', sort_order: 0, is_published: true, default_hash: null, created_by: null,
  created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z',
};

const montar = () => render(<ConfirmProvider><PortalHelpSettings /></ConfirmProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  orgIdDoTopo = null;
  list.mockResolvedValue([SOBRESCRITA]);
  saveOverride.mockImplementation(async (i: Record<string, unknown>) => ({ ...SOBRESCRITA, ...i, id: 'novo' }));
  remove.mockResolvedValue(undefined);
});

describe('PortalHelpSettings', () => {
  it('topo em "Todas": lista pela org nula, mostra a coluna Organização com o padrão e a versão de cada org', async () => {
    montar();
    await waitFor(() => expect(list).toHaveBeenCalledWith(null, 'parceiro'));
    expect(screen.getByRole('columnheader', { name: 'Organização' })).toBeInTheDocument();
    const linhaPadrao = (await screen.findByText(primeiro.title)).closest('tr')!;
    expect(within(linhaPadrao).getByText('Padrão do sistema')).toBeInTheDocument();
    expect(within(linhaPadrao).getByText('Padrão')).toBeInTheDocument();
    const linhaBeta = screen.getByText('Versão da Beta').closest('tr')!;
    expect(within(linhaBeta).getByText('Beta')).toBeInTheDocument();
    expect(within(linhaBeta).getByText('Personalizado')).toBeInTheDocument();
  });

  it('com org no topo não há coluna Organização e a lista é filtrada por ela', async () => {
    orgIdDoTopo = 'org-b';
    montar();
    await waitFor(() => expect(list).toHaveBeenCalledWith('org-b', 'parceiro'));
    expect(screen.queryByRole('columnheader', { name: 'Organização' })).not.toBeInTheDocument();
    // na org-b o padrão daquele item aparece já com a versão dela (uma linha só)
    await screen.findByText('Versão da Beta');
    expect(screen.queryByText(primeiro.title)).not.toBeInTheDocument();
  });

  it('personalizar um padrão em "Todas": abre o painel, grava por resolveWriteOrg(all-allowed) e replica por org', async () => {
    const user = userEvent.setup();
    montar();
    const linhaPadrao = (await screen.findByText(primeiro.title)).closest('tr')!;
    await user.click(within(linhaPadrao).getByTitle('Personalizar este texto'));
    expect(screen.getByRole('heading', { name: 'Personalizar texto padrão' })).toBeInTheDocument();
    const titulo = screen.getByDisplayValue(primeiro.title);
    await user.clear(titulo);
    await user.type(titulo, 'Título da casa');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(resolveWriteOrg).toHaveBeenCalledWith('all-allowed'));
    await waitFor(() => expect(saveOverride).toHaveBeenCalledTimes(2));
    const orgs = saveOverride.mock.calls.map(c => (c[0] as { organization_id: string }).organization_id).sort();
    expect(orgs).toEqual(['org-a', 'org-b']);
    expect(saveOverride.mock.calls[0][0]).toMatchObject({ portal: 'parceiro', default_key: primeiro.key, title: 'Título da casa', is_published: true });
    expect((saveOverride.mock.calls[0][0] as { default_hash: string }).default_hash).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('restaurar o padrão passa pelo confirm e apaga a sobrescrita; o botão fica desligado onde já é padrão (com o motivo)', async () => {
    const user = userEvent.setup();
    montar();
    const linhaPadrao = (await screen.findByText(primeiro.title)).closest('tr')!;
    const desligado = within(linhaPadrao).getByTitle('Já é o padrão');
    expect(desligado).toBeDisabled();
    const linhaBeta = screen.getByText('Versão da Beta').closest('tr')!;
    await user.click(within(linhaBeta).getByTitle('Restaurar o padrão'));
    expect(await screen.findByText('Restaurar o padrão?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('r1'));
  });

  it('novo item: pré-visualização sanitizada e gravação como item próprio', async () => {
    const user = userEvent.setup();
    createCustom.mockResolvedValue({ ...SOBRESCRITA, id: 'c1', default_key: null });
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Novo item' }));
    expect(screen.getByRole('heading', { name: 'Novo item de ajuda' })).toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    expect(salvar).toHaveAttribute('title', 'Informe o título');
    const campos = screen.getAllByRole('textbox');
    await user.type(campos[0], 'Horário da obra');
    await user.type(campos[1], '<p>Das 7h às 17h</p><script>window.__xss=1</script>');
    await user.click(screen.getByRole('button', { name: 'Pré-visualizar' }));
    expect(screen.getByText('Das 7h às 17h')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    await user.click(salvar);
    await waitFor(() => expect(createCustom).toHaveBeenCalledTimes(2));
    expect(createCustom.mock.calls[0][0]).toMatchObject({ portal: 'parceiro', kind: 'artigo', title: 'Horário da obra', section: null });
  });

  it('aba Tour: escolhe o tour, mostra posição e elemento; em "Todas" as setas dizem por que não reordenam', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    expect(screen.getByRole('columnheader', { name: 'Posição' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Elemento' })).toBeInTheDocument();
    const linha1 = screen.getByText('Bem-vindo ao Portal do Parceiro').closest('tr')!;
    expect(within(linha1).getByText('1º')).toBeInTheDocument();
    expect(within(linha1).getByText('Menu do portal')).toBeInTheDocument();
    const setas = within(linha1).getAllByTitle('Escolha uma organização no topo para reordenar');
    expect(setas).toHaveLength(2);
    setas.forEach(b => expect(b).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Novo passo' })).toBeInTheDocument();
    // "como usar" de uma aba
    await user.selectOptions(screen.getByLabelText('Tour'), 'documentos');
    // o título do passo ("Buscar") também nomeia o elemento na coluna Elemento
    expect(screen.getAllByText(TOURS.parceiro.porAba.documentos![0].title).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('row')).toHaveLength(1 + TOURS.parceiro.porAba.documentos!.length);
    expect(screen.queryByText('Bem-vindo ao Portal do Parceiro')).not.toBeInTheDocument();
    // aba sem passo padrão: tabela vazia convida a criar
    await user.selectOptions(screen.getByLabelText('Tour'), 'conversas');
    await user.selectOptions(screen.getByLabelText('Tour'), 'dashboard');
    expect(screen.getAllByText(TOURS.parceiro.porAba.dashboard![0].title).length).toBeGreaterThan(0);
  });

  it('com org no topo: ↓ no 1º passo renumera o tour inteiro na org (padrão sem linha vira sobrescrita só de posição)', async () => {
    const user = userEvent.setup();
    orgIdDoTopo = 'org-b';
    list.mockResolvedValue([]);
    update.mockResolvedValue({});
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    const linha1 = screen.getByText('Bem-vindo ao Portal do Parceiro').closest('tr')!;
    expect(within(linha1).getByTitle('Já é o primeiro')).toBeDisabled();
    await user.click(within(linha1).getByTitle('Descer'));
    // só os dois primeiros mudam de lugar: 1º→20, 2º→10; os outros já estavam em (i+1)*10
    await waitFor(() => expect(saveOverride).toHaveBeenCalledTimes(2));
    const chamadas = saveOverride.mock.calls.map(c => c[0] as { default_key: string; sort_order: number; organization_id: string; kind: string; title: string });
    const g = TOURS.parceiro.geral;
    expect(chamadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ default_key: g[0].key, sort_order: 20, organization_id: 'org-b', kind: 'tour', title: g[0].title }),
      expect.objectContaining({ default_key: g[1].key, sort_order: 10, organization_id: 'org-b', kind: 'tour', title: g[1].title }),
    ]));
    expect(resolveWriteOrg).not.toHaveBeenCalled();
  });

  it('"Novo passo": exige o elemento (com o motivo), filtra o catálogo pela aba e grava kind=tour com âncora e tour', async () => {
    const user = userEvent.setup();
    createCustom.mockResolvedValue({ ...SOBRESCRITA, id: 'p1', kind: 'tour', default_key: null });
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    await user.selectOptions(screen.getByLabelText('Tour'), 'documentos');
    await user.click(screen.getByRole('button', { name: 'Novo passo' }));
    expect(screen.getByRole('heading', { name: 'Novo passo do tour' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Filtro por pasta');
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    expect(salvar).toHaveAttribute('title', 'Escolha o elemento da tela que o passo realça');
    const ancora = screen.getByLabelText('Elemento da tela');
    const opcoes = within(ancora).getAllByRole('option').map(o => (o as HTMLOptionElement).value).filter(Boolean);
    // no "como usar: Documentos" só entram elementos de Documentos e o cromo
    expect(opcoes).toContain('documentos-busca');
    expect(opcoes).toContain('menu');
    expect(opcoes).not.toContain('contratos-lista');
    await user.selectOptions(ancora, 'documentos-busca');
    await user.type(screen.getByLabelText('Texto do passo'), 'Use a pasta para achar o projeto.');
    expect(salvar).toBeEnabled();
    await user.click(salvar);
    await waitFor(() => expect(createCustom).toHaveBeenCalledTimes(2));
    expect(createCustom.mock.calls[0][0]).toMatchObject({
      portal: 'parceiro', kind: 'tour', anchor: 'documentos-busca', tour_id: 'documentos', section: 'documentos',
      title: 'Filtro por pasta', body_html: 'Use a pasta para achar o projeto.', sort_order: 100000,
    });
  });

  it('passo próprio aparece no tour dele, com origem Próprio e excluir', async () => {
    const user = userEvent.setup();
    orgIdDoTopo = 'org-b';
    list.mockResolvedValue([{ ...SOBRESCRITA, id: 'p9', kind: 'tour', default_key: null, anchor: 'documentos-busca', tour_id: 'documentos', section: 'documentos', title: 'Passo da casa', body_html: 'texto', sort_order: 15 }]);
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    expect(screen.queryByText('Passo da casa')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tour'), 'documentos');
    const linha = screen.getByText('Passo da casa').closest('tr')!;
    expect(within(linha).getByText('2º')).toBeInTheDocument();
    expect(within(linha).getByText('Próprio')).toBeInTheDocument();
    expect(within(linha).getByTitle('Excluir passo')).toBeEnabled();
  });

  it('pré-visualizar: desligado em "Todas" com o motivo; com org abre o portal com o tour escolhido forçado', async () => {
    const user = userEvent.setup();
    const a = montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    const previa = screen.getByRole('button', { name: /Pré-visualizar tour/ });
    expect(previa).toBeDisabled();
    expect(previa).toHaveAttribute('title', 'Escolha uma organização no topo para pré-visualizar');
    a.unmount();

    orgIdDoTopo = 'org-b';
    list.mockResolvedValue([]);
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    await user.click(screen.getByRole('button', { name: /Pré-visualizar tour/ }));
    await waitFor(() => expect(listWorkspaces).toHaveBeenCalledWith('org-b'));
    // um parceiro só: já vem escolhido
    await waitFor(() => expect((screen.getByLabelText('Parceiro') as HTMLSelectElement).value).toBe('ws1'));
    await user.selectOptions(screen.getByLabelText('Tour', { selector: '#ajuda-previa-tour' }), 'documentos');
    await user.click(screen.getByRole('button', { name: /Abrir/ }));
    expect(await screen.findByText('portal do parceiro em prévia')).toBeInTheDocument();
    expect(portalDaPrevia).toHaveBeenLastCalledWith(expect.objectContaining({ previewWorkspaceId: 'ws1', forcarTour: 'documentos', userEmail: '' }));
  });
});
