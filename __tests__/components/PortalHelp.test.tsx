// @vitest-environment jsdom
/**
 * Central de ajuda dos portais — o painel que o parceiro/fornecedor/corretor abre.
 * Pedido de 03/10/2026, docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. seções = abas liberadas (+ Geral); aba oculta não aparece;
 *   2. busca acha por título E por texto do corpo; artigo abre e volta;
 *   3. FAQ expande; corpo editado pela construtora passa por sanitizeHtml
 *      (<script>/onerror não chegam ao DOM);
 *   4. "Abrir uma solicitação" só com `onOpenRequest`; contato só com dado;
 *   5. falha de rede → aviso + conteúdo padrão (a ajuda nunca fica vazia).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getByToken = vi.fn();
const getMine = vi.fn();
vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: { getByToken: (...a: unknown[]) => getByToken(...a), getMine: (...a: unknown[]) => getMine(...a) },
}));

import { PortalHelp } from '../../components/portal/PortalHelp';
import { ConfirmProvider } from '../../components/ui/confirm';
import { DEFAULT_ITEMS } from '../../utils/portalHelpDefaults';

const primeiroArtigo = DEFAULT_ITEMS.parceiro.find(d => d.kind === 'artigo' && d.section === 'documentos')!;

const PAYLOAD = {
  org_id: 'org1',
  contact: { name: 'Alpa Construtora', email: 'obra@alpa.com', phone: '(31) 99999-0000', website: null },
  items: [
    { id: 'r1', kind: 'artigo', default_key: primeiroArtigo.key, section: 'documentos', title: 'Documentos do jeito da Alpa', body_html: '<p>Texto da <strong>Alpa</strong></p><script>window.__xss=1</script><img src=x onerror="window.__xss=2">', sort_order: 0, is_published: true },
    { id: 'r2', kind: 'faq', default_key: null, section: null, title: 'Pergunta só da Alpa?', body_html: '<p>Resposta da Alpa com palavra rara: zimbório.</p>', sort_order: 0, is_published: true },
  ],
};

function montar(extra: Partial<React.ComponentProps<typeof PortalHelp>> = {}) {
  const onClose = vi.fn();
  render(
    <ConfirmProvider>
      <PortalHelp open onClose={onClose} portal="parceiro" token="tok" visibleSections={['dashboard', 'documentos', 'solicitacoes']} {...extra} />
    </ConfirmProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getByToken.mockResolvedValue(PAYLOAD);
});

describe('PortalHelp', () => {
  it('lista as seções liberadas (+ Geral) e esconde a aba oculta', async () => {
    montar();
    await waitFor(() => expect(getByToken).toHaveBeenCalledWith('parceiro', 'tok'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Geral' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contratos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Financeiro' })).not.toBeInTheDocument();
  });

  it('abre a seção da aba ativa, abre o artigo (sobrescrito pela construtora) sanitizado e volta', async () => {
    const user = userEvent.setup();
    montar({ currentSection: 'documentos' });
    const link = await screen.findByRole('button', { name: /Documentos do jeito da Alpa/ });
    await user.click(link);
    expect(screen.getByRole('heading', { name: 'Documentos do jeito da Alpa' })).toBeInTheDocument();
    expect(screen.getByText('Alpa', { selector: 'strong' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByPlaceholderText('Buscar na ajuda...')).toBeInTheDocument();
  });

  it('busca por título e por texto do corpo; nada encontrado diz isso', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole('button', { name: 'Documentos' });
    const busca = screen.getByPlaceholderText('Buscar na ajuda...');
    await user.type(busca, 'zimbório');
    expect(screen.getByText('1 resultado(s)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pergunta só da Alpa/ })).toBeInTheDocument();
    await user.clear(busca);
    await user.type(busca, 'Nova Solicitação');
    expect(screen.getByRole('button', { name: /Solicitações: como abrir um pedido/ })).toBeInTheDocument();
    await user.clear(busca);
    await user.type(busca, 'xyzxyzxyz');
    expect(screen.getByText('Nada encontrado para a busca.')).toBeInTheDocument();
  });

  it('FAQ expande com a resposta; a própria da construtora entra junto', async () => {
    const user = userEvent.setup();
    montar();
    const pergunta = await screen.findByRole('button', { name: 'Pergunta só da Alpa?' });
    expect(pergunta).toHaveAttribute('aria-expanded', 'false');
    await user.click(pergunta);
    expect(pergunta).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/zimbório/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Meu link de acesso parou de funcionar. O que faço?' })).toBeInTheDocument();
  });

  it('contato: nome, e-mail, telefone e WhatsApp; "Abrir uma solicitação" só com onOpenRequest', async () => {
    const user = userEvent.setup();
    const onOpenRequest = vi.fn();
    montar({ onOpenRequest });
    await screen.findByRole('heading', { name: 'Falar com Alpa Construtora' });
    expect(screen.getByRole('link', { name: /obra@alpa.com/ })).toHaveAttribute('href', 'mailto:obra@alpa.com');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5531999990000');
    await user.click(screen.getByRole('button', { name: 'Abrir uma solicitação' }));
    expect(onOpenRequest).toHaveBeenCalledTimes(1);
  });

  it('sem onOpenRequest não há botão de solicitação; sem contato, aviso em vez de botões vazios', async () => {
    getByToken.mockResolvedValue({ ...PAYLOAD, contact: null, items: [] });
    montar();
    await screen.findByRole('button', { name: 'Documentos' });
    expect(screen.queryByRole('button', { name: 'Abrir uma solicitação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(screen.getByText(/ainda não informou um contato/)).toBeInTheDocument();
  });

  it('falha de rede: aviso e o conteúdo padrão continua', async () => {
    getByToken.mockRejectedValue(new Error('boom'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    montar();
    await screen.findByText(/Não foi possível carregar a ajuda da construtora/);
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Meu link de acesso parou de funcionar. O que faço?' })).toBeInTheDocument();
    erro.mockRestore();
  });

  it('fechado não busca nada; aberto sem token usa get_mine e, com várias construtoras, pede para escolher', async () => {
    const { rerender } = render(<ConfirmProvider><PortalHelp open={false} onClose={() => {}} portal="fornecedor" /></ConfirmProvider>);
    expect(getByToken).not.toHaveBeenCalled();
    expect(getMine).not.toHaveBeenCalled();
    getMine.mockResolvedValue({ orgs: [{ id: 'a', name: 'Alpa' }, { id: 'b', name: 'Beta' }], help: null });
    rerender(<ConfirmProvider><PortalHelp open onClose={() => {}} portal="fornecedor" /></ConfirmProvider>);
    await waitFor(() => expect(getMine).toHaveBeenCalledWith('fornecedor', null));
    const select = await screen.findByRole('combobox');
    expect(within(select).getByRole('option', { name: 'Escolha a construtora' })).toBeInTheDocument();
    getMine.mockResolvedValue({ orgs: [{ id: 'a', name: 'Alpa' }, { id: 'b', name: 'Beta' }], help: { org_id: 'b', contact: { name: 'Beta', email: null, phone: null, website: null }, items: [] } });
    await userEvent.setup().selectOptions(select, 'b');
    await waitFor(() => expect(getMine).toHaveBeenLastCalledWith('fornecedor', 'b'));
    await screen.findByRole('heading', { name: 'Falar com Beta' });
  });
});
