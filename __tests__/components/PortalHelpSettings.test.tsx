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
import { DEFAULT_ITEMS } from '../../utils/portalHelpDefaults';

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
    const desligado = within(linhaPadrao).getByTitle('Já é o texto padrão');
    expect(desligado).toBeDisabled();
    const linhaBeta = screen.getByText('Versão da Beta').closest('tr')!;
    await user.click(within(linhaBeta).getByTitle('Restaurar o texto padrão'));
    expect(await screen.findByText('Restaurar o texto padrão?')).toBeInTheDocument();
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

  it('aba Tour: lista os passos com a posição fixa e sem o botão Novo item', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText(primeiro.title);
    await user.click(screen.getByRole('button', { name: 'Tour guiado' }));
    expect(screen.getByText(/A posição dos passos na tela é fixa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo item' })).not.toBeInTheDocument();
    expect(screen.getByText('Bem-vindo ao Portal do Parceiro')).toBeInTheDocument();
    expect(screen.getByText(/^1º · Tour do portal$/)).toBeInTheDocument();
    // mini-tours por aba também aparecem para editar
    expect(screen.getAllByText(/^1º · Como usar: Documentos$/).length).toBeGreaterThan(0);
  });
});
