// @vitest-environment jsdom
/**
 * Central de ajuda × tour — o painel é quem decide QUAL tour roda e quando.
 * F3 (tour do portal) + v2 (04/10/2026: mini-tour por aba, prévia do gestor).
 *
 * O que trava:
 *   1. primeiro acesso (sem marca) com `autoTour` + `tourKey`: o tour do portal
 *      abre sozinho e busca a ajuda (sobrescritas da construtora nos textos);
 *   2. "Pular" grava a marca; já visto não reabre; sem tourKey / sem autoTour
 *      não abre;
 *   3. mini-tour: trocar de aba depois do tour do portal visto abre o "como
 *      usar esta tela" UMA vez; o valor inicial da aba não dispara; antes de ver
 *      o tour do portal não dispara;
 *   4. "Rever o tour desta tela" e "Rever o tour do portal" no painel;
 *   5. prévia (`modoPrevia`): sem tourKey o "Rever" existe; `forcarTour` abre e
 *      nada é gravado.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const getByToken = vi.fn();
vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: { getByToken: (...a: unknown[]) => getByToken(...a), getMine: vi.fn() },
}));

import { PortalHelp } from '../../components/portal/PortalHelp';
import { ConfirmProvider } from '../../components/ui/confirm';
import { TOURS } from '../../utils/portalHelpDefaults';
import { chaveDoTour } from '../../utils/portalTour';

const GERAL = TOURS.parceiro.geral;
const DOCS = TOURS.parceiro.porAba.documentos!;
const ANCORAS = ['menu', 'ajuda', 'documentos-busca', 'documentos-tabela', 'documentos-enviar'];

const rectOriginal = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getByToken.mockResolvedValue({ org_id: 'org1', contact: null, items: [] });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const area = (this as HTMLElement).hasAttribute?.('data-tour') ? 100 : 0;
    return { top: 40, left: 20, width: area, height: area, right: 20 + area, bottom: 40 + area, x: 20, y: 40, toJSON: () => ({}) } as DOMRect;
  };
  const raiz = document.createElement('div');
  raiz.setAttribute('data-ancoras', '');
  for (const a of ANCORAS) { const el = document.createElement('button'); el.setAttribute('data-tour', a); raiz.appendChild(el); }
  document.body.appendChild(raiz);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal;
  document.querySelectorAll('[data-ancoras]').forEach(el => el.remove());
});

type Props = Partial<React.ComponentProps<typeof PortalHelp>>;
const arvore = (props: Props) => (
  <ConfirmProvider>
    <PortalHelp open={false} onClose={() => {}} portal="parceiro" token="tok" tourKey="tok" autoTour currentSection="dashboard" {...props} />
  </ConfirmProvider>
);
const montar = (props: Props = {}) => render(arvore(props));
const esperar = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const vistoGeral = () => localStorage.setItem(chaveDoTour('parceiro', 'tok'), 'concluido@2026-10-04');

describe('PortalHelp × tour', () => {
  it('primeiro acesso: tour do portal abre sozinho e busca a ajuda; Pular grava a marca do tour geral', async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByRole('dialog', { name: 'Tour do portal' })).toBeInTheDocument();
    expect(getByToken).toHaveBeenCalledWith('parceiro', 'tok');
    expect(screen.getByText(GERAL[0].title)).toBeInTheDocument();
    expect(screen.getByText(`Passo 1 de ${GERAL.length}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(chaveDoTour('parceiro', 'tok'))).toMatch(/^pulado@/);
  });

  it('já visto: não reabre; sem tourKey ou sem autoTour: não abre', async () => {
    vistoGeral();
    const a = montar();
    await esperar(50);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getByToken).not.toHaveBeenCalled();
    a.unmount();
    localStorage.clear();
    const b = montar({ tourKey: null });
    await esperar(50);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    b.unmount();
    montar({ autoTour: false });
    await esperar(50);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('texto do passo vem da sobrescrita da construtora', async () => {
    getByToken.mockResolvedValue({
      org_id: 'org1', contact: null,
      items: [{ id: 't1', kind: 'tour', default_key: GERAL[0].key, section: null, title: 'Olá, parceiro da Alpa', body_html: '<p>Texto <strong>nosso</strong></p>', sort_order: 0, is_published: true }],
    });
    montar();
    expect(await screen.findByText('Olá, parceiro da Alpa')).toBeInTheDocument();
    expect(screen.getByText('Texto nosso')).toBeInTheDocument();
  });

  it('mini-tour: trocar para Documentos depois do tour do portal abre o "como usar" uma vez', async () => {
    const user = userEvent.setup();
    vistoGeral();
    const { rerender } = montar();
    await esperar(50);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(arvore({ currentSection: 'documentos' }));
    expect(await screen.findByText(DOCS[0].title, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText(`Passo 1 de ${DOCS.length}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(localStorage.getItem(chaveDoTour('parceiro', 'tok', 'documentos'))).toMatch(/^pulado@/);
    // sair e voltar não reabre
    rerender(arvore({ currentSection: 'dashboard' }));
    await esperar(30);
    rerender(arvore({ currentSection: 'documentos' }));
    await esperar(600);
    expect(screen.queryByRole('dialog', { name: 'Tour do portal' })).not.toBeInTheDocument();
  });

  it('mini-tour não dispara antes do tour do portal nem pelo valor inicial da aba', async () => {
    // tour do portal ainda não visto → ele abre; o mini-tour não se mete
    const a = montar({ currentSection: 'documentos' });
    expect(await screen.findByText(GERAL[0].title)).toBeInTheDocument();
    a.unmount();
    // tour do portal visto e a tela JÁ abre em Documentos: não é troca de aba
    localStorage.clear();
    vistoGeral();
    montar({ currentSection: 'documentos' });
    await esperar(600);
    expect(screen.queryByRole('dialog', { name: 'Tour do portal' })).not.toBeInTheDocument();
  });

  it('painel: "Rever o tour desta tela" (só em aba com mini-tour) e "Rever o tour do portal"', async () => {
    const user = userEvent.setup();
    vistoGeral();
    const onClose = vi.fn();
    const { rerender } = montar({ open: true, onClose, currentSection: 'documentos' });
    const desta = await screen.findByRole('button', { name: 'Rever o tour desta tela (Documentos)' });
    await user.click(desta);
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText(DOCS[0].title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular o tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour do portal' })).not.toBeInTheDocument());

    // aba sem mini-tour: só o do portal
    rerender(arvore({ open: true, onClose, currentSection: 'nao-existe' }));
    await screen.findByPlaceholderText('Buscar na ajuda...');
    expect(screen.queryByRole('button', { name: /Rever o tour desta tela/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rever o tour do portal' }));
    expect(await screen.findByText(GERAL[0].title)).toBeInTheDocument();
  });

  it('prévia do gestor: sem tourKey o "Rever" existe, forcarTour abre e nada é gravado', async () => {
    const user = userEvent.setup();
    const a = render(arvore({ tourKey: null, autoTour: false, modoPrevia: true, open: true }));
    expect(await screen.findByRole('button', { name: 'Rever o tour do portal' })).toBeInTheDocument();
    a.unmount();
    render(arvore({ tourKey: null, autoTour: false, modoPrevia: true, forcarTour: 'documentos', currentSection: 'documentos' }));
    expect(await screen.findByText(DOCS[0].title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(Object.keys(localStorage).filter(k => k.startsWith('portalHelp:tour'))).toEqual([]);
  });

  it('a volta automática do fim do tour não dispara mini-tour; o clique do usuário logo depois dispara', async () => {
    const user = userEvent.setup();
    const extra = document.createElement('div');
    extra.setAttribute('data-ancoras', '');
    const b1 = document.createElement('button'); b1.setAttribute('data-tour', 'aba-documentos'); extra.appendChild(b1);
    document.body.appendChild(extra);
    const navegacoes: string[] = [];
    function Portal() {
      const [secao, setSecao] = React.useState('dashboard');
      const ir = (s: string) => {
        navegacoes.push(s);
        if (s === 'contratos' && !document.querySelector('[data-tour="aba-contratos"]')) {
          for (const a of ['aba-contratos', 'contratos-lista']) { const el = document.createElement('button'); el.setAttribute('data-tour', a); extra.appendChild(el); }
        }
        setSecao(s);
      };
      return (
        <ConfirmProvider>
          <button type="button" onClick={() => setSecao('documentos')}>usuário abre Documentos</button>
          <PortalHelp open={false} onClose={() => {}} portal="parceiro" token="tok" tourKey="tok" autoTour currentSection={secao} onNavigate={ir} />
        </ConfirmProvider>
      );
    }
    render(<Portal />);
    await screen.findByText(GERAL[0].title);
    // menu → aba-documentos → documentos-enviar → aba-contratos (precisa navegar)
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(await screen.findByText('Contratos', { selector: 'h3' }, { timeout: 3000 })).toBeInTheDocument();
    expect(navegacoes).toEqual(['contratos']);
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    // voltou para o Dashboard sozinho — e isso NÃO abre o mini-tour do Dashboard
    expect(navegacoes).toEqual(['contratos', 'dashboard']);
    await esperar(600);
    expect(screen.queryByRole('dialog', { name: 'Tour do portal' })).not.toBeInTheDocument();
    // o usuário abre Documentos logo em seguida: aí sim, "como usar esta tela"
    await user.click(screen.getByRole('button', { name: 'usuário abre Documentos' }));
    expect(await screen.findByText(DOCS[0].title, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('sem tourKey e fora da prévia o painel não oferece tour', async () => {
    montar({ open: true, tourKey: null });
    await screen.findByPlaceholderText('Buscar na ajuda...');
    expect(screen.queryByRole('button', { name: /Rever o tour/ })).not.toBeInTheDocument();
  });
});
