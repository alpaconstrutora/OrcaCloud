// @vitest-environment jsdom
/**
 * Central de ajuda × tour — o painel é quem decide quando o tour roda.
 * F3 (04/10/2026), docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. primeiro acesso (sem marca no aparelho) com `autoTour` + `tourKey`: o
 *      tour abre sozinho, mesmo com o painel fechado, e busca a ajuda (para
 *      aplicar as sobrescritas da construtora nos textos dos passos);
 *   2. "Pular" grava a marca; montar de novo não reabre;
 *   3. "Rever o tour do portal" dentro do painel fecha o painel e reabre o tour;
 *   4. sem `tourKey` (prévia) não há tour nem botão de rever; `autoTour=false`
 *      não abre sozinho.
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
import { TOUR_STEPS } from '../../utils/portalHelpDefaults';
import { chaveDoTour } from '../../utils/portalTour';

const rectOriginal = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getByToken.mockResolvedValue({ org_id: 'org1', contact: null, items: [] });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const area = (this as HTMLElement).hasAttribute?.('data-tour') ? 100 : 0;
    return { top: 40, left: 20, width: area, height: area, right: 20 + area, bottom: 40 + area, x: 20, y: 40, toJSON: () => ({}) } as DOMRect;
  };
  const menu = document.createElement('aside'); menu.setAttribute('data-tour', 'menu'); document.body.appendChild(menu);
  const ajuda = document.createElement('button'); ajuda.setAttribute('data-tour', 'ajuda'); document.body.appendChild(ajuda);
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal;
  document.querySelectorAll('aside[data-tour], body > button[data-tour]').forEach(el => el.remove());
});

const montar = (props: Partial<React.ComponentProps<typeof PortalHelp>> = {}) => {
  const onClose = vi.fn();
  const utils = render(
    <ConfirmProvider>
      <PortalHelp open={false} onClose={onClose} portal="parceiro" token="tok" tourKey="tok" autoTour {...props} />
    </ConfirmProvider>,
  );
  return { onClose, ...utils };
};

describe('PortalHelp × tour', () => {
  it('primeiro acesso: tour abre sozinho com o painel fechado e busca a ajuda; Pular grava a marca', async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByRole('dialog', { name: 'Tour do portal' })).toBeInTheDocument();
    expect(getByToken).toHaveBeenCalledWith('parceiro', 'tok');
    expect(screen.getByText(TOUR_STEPS.parceiro[0].title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(chaveDoTour('parceiro', 'tok'))).toMatch(/^pulado@/);
  });

  it('já visto neste aparelho: não reabre; sem tourKey ou sem autoTour: não abre', async () => {
    localStorage.setItem(chaveDoTour('parceiro', 'tok'), 'concluido@2026-10-04');
    const a = montar();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getByToken).not.toHaveBeenCalled();
    a.unmount();
    localStorage.clear();
    const b = montar({ tourKey: null });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    b.unmount();
    montar({ autoTour: false });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('texto do passo vem da sobrescrita da construtora', async () => {
    getByToken.mockResolvedValue({
      org_id: 'org1', contact: null,
      items: [{ id: 't1', kind: 'tour', default_key: TOUR_STEPS.parceiro[0].key, section: null, title: 'Olá, parceiro da Alpa', body_html: '<p>Texto <strong>nosso</strong></p>', sort_order: 0, is_published: true }],
    });
    montar();
    expect(await screen.findByText('Olá, parceiro da Alpa')).toBeInTheDocument();
    expect(screen.getByText('Texto nosso')).toBeInTheDocument();
  });

  it('"Rever o tour do portal" fecha o painel e reabre o tour; sem tourKey o botão não existe', async () => {
    const user = userEvent.setup();
    localStorage.setItem(chaveDoTour('parceiro', 'tok'), 'concluido@2026-10-04');
    const { onClose, rerender } = montar({ open: true });
    const rever = await screen.findByRole('button', { name: 'Rever o tour do portal' });
    await user.click(rever);
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Tour do portal' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular o tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour do portal' })).not.toBeInTheDocument());

    rerender(
      <ConfirmProvider>
        <PortalHelp open onClose={onClose} portal="parceiro" token="tok" tourKey={null} />
      </ConfirmProvider>,
    );
    await screen.findByPlaceholderText('Buscar na ajuda...');
    expect(screen.queryByRole('button', { name: 'Rever o tour do portal' })).not.toBeInTheDocument();
  });
});
