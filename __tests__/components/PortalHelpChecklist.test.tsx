// @vitest-environment jsdom
/**
 * Central de ajuda × "Primeiros passos" (tour v2, F8 — 04/10/2026).
 * docs/planos/2026-10-04-tour-guiado-v2-portais.md
 *
 * O que trava:
 *   1. o cartão é desenhado DENTRO do encaixe que o portal passa
 *      (checklistSlot) — sem encaixe, não há cartão;
 *   2. abrir a aba do item (pelo usuário) e as ações avisadas pelo portal
 *      (utils/portalEventos) marcam o item: no aparelho e no banco
 *      (tour_id 'checklist:<chave>');
 *   3. a navegação automática do tour NÃO conta como "abriu a aba";
 *   4. "Ocultar" grava 'checklist' = pulado e o cartão some; a Ajuda oferece
 *      mostrar de novo; ocultado em outro aparelho (banco) também some;
 *   5. prévia do gestor: cartão aparece, sem "Ocultar" e sem gravar nada;
 *   6. item de aba oculta para o externo não entra.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const getByToken = vi.fn();
const getMine = vi.fn();
const markTour = vi.fn(async () => {});
vi.mock('../../services/portalHelpService', () => ({
  portalHelpService: {
    getByToken: (...a: unknown[]) => getByToken(...a),
    getMine: (...a: unknown[]) => getMine(...a),
    markTour: (...a: unknown[]) => markTour(...a),
  },
}));

import { PortalHelp } from '../../components/portal/PortalHelp';
import { ConfirmProvider } from '../../components/ui/confirm';
import { CHECKLIST_ITEMS } from '../../utils/portalHelpDefaults';
import { avisarAcaoDoPortal } from '../../utils/portalEventos';
import { chaveDoTour } from '../../utils/portalTour';

const ITENS = CHECKLIST_ITEMS.parceiro;
const item = (slug: string) => ITENS.find(i => i.key === `parceiro.checklist.${slug}`)!;
let slot: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // tour do portal já visto: o foco aqui é o checklist
  localStorage.setItem(chaveDoTour('parceiro', 'tok'), 'concluido@2026-10-04');
  getByToken.mockResolvedValue({ org_id: 'org1', contact: null, items: [], seen: [] });
  slot = document.createElement('div');
  slot.setAttribute('data-testid', 'encaixe');
  document.body.appendChild(slot);
});
afterEach(() => { slot.remove(); });

type Props = Partial<React.ComponentProps<typeof PortalHelp>>;
const arvore = (props: Props = {}) => (
  <ConfirmProvider>
    <PortalHelp open={false} onClose={() => {}} portal="parceiro" token="tok" tourKey="tok" autoTour currentSection="dashboard" checklistSlot={slot} {...props} />
  </ConfirmProvider>
);
const esperar = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const cartao = () => slot.querySelector('section[aria-label="Primeiros passos"]');

describe('PortalHelp × Primeiros passos', () => {
  it('desenha o cartão no encaixe do portal; sem encaixe, nada', async () => {
    const { unmount } = render(arvore());
    await waitFor(() => expect(cartao()).not.toBeNull());
    expect(slot.textContent).toContain(`0 de ${ITENS.length} feitos`);
    unmount();
    render(arvore({ checklistSlot: null }));
    await esperar(50);
    expect(cartao()).toBeNull();
  });

  it('abrir a aba do item (usuário) marca no aparelho e no banco', async () => {
    const { rerender } = render(arvore());
    await waitFor(() => expect(cartao()).not.toBeNull());
    rerender(arvore({ currentSection: 'contratos' }));
    const chave = `checklist:${item('contratos').key}`;
    await waitFor(() => expect(markTour).toHaveBeenCalledWith('parceiro', expect.objectContaining({ token: 'tok' }), chave, 'concluido', null));
    expect(localStorage.getItem(chaveDoTour('parceiro', 'tok', chave))).toMatch(/^concluido@/);
    await waitFor(() => expect(slot.textContent).toContain(`1 de ${ITENS.length} feitos`));
    // voltar à aba não grava de novo
    rerender(arvore({ currentSection: 'dashboard' }));
    rerender(arvore({ currentSection: 'contratos' }));
    await esperar(30);
    expect(markTour).toHaveBeenCalledTimes(1);
  });

  it('ação avisada pelo portal marca o item dela', async () => {
    render(arvore());
    await waitFor(() => expect(cartao()).not.toBeNull());
    act(() => avisarAcaoDoPortal('enviou-documento'));
    await waitFor(() => expect(markTour).toHaveBeenCalledWith('parceiro', expect.anything(), `checklist:${item('enviar-documento').key}`, 'concluido', null));
    // ação sem item no portal do parceiro não faz nada
    act(() => avisarAcaoDoPortal('criou-lead'));
    await esperar(20);
    expect(markTour).toHaveBeenCalledTimes(1);
  });

  it('visto no banco (outro aparelho) já chega marcado', async () => {
    getByToken.mockResolvedValue({ org_id: 'org1', contact: null, items: [], seen: [{ tour_id: `checklist:${item('financeiro').key}`, status: 'concluido' }] });
    render(arvore());
    await waitFor(() => expect(slot.textContent).toContain(`1 de ${ITENS.length} feitos`));
  });

  it('Ocultar grava "checklist" = pulado e o cartão some; a Ajuda oferece mostrar de novo', async () => {
    const user = userEvent.setup();
    const { rerender } = render(arvore());
    await waitFor(() => expect(cartao()).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(markTour).toHaveBeenCalledWith('parceiro', expect.anything(), 'checklist', 'pulado', null);
    await waitFor(() => expect(cartao()).toBeNull());
    rerender(arvore({ open: true }));
    const mostrar = await screen.findByRole('button', { name: /Mostrar os primeiros passos de novo \(0 de 5 feitos\)/ });
    await user.click(mostrar);
    expect(markTour).toHaveBeenLastCalledWith('parceiro', expect.anything(), 'checklist', 'visto', null);
    await waitFor(() => expect(cartao()).not.toBeNull());
  });

  it('ocultado em outro aparelho (banco) não aparece aqui', async () => {
    getByToken.mockResolvedValue({ org_id: 'org1', contact: null, items: [], seen: [{ tour_id: 'checklist', status: 'pulado' }] });
    render(arvore());
    await waitFor(() => expect(getByToken).toHaveBeenCalled());
    await esperar(50);
    expect(cartao()).toBeNull();
  });

  it('prévia do gestor: cartão sem "Ocultar" e nada gravado', async () => {
    getMine.mockResolvedValue({ orgs: [{ id: 'org1', name: 'Alpa' }], help: { org_id: 'org1', contact: null, items: [], seen: [] } });
    const { rerender } = render(arvore({ token: null, tourKey: null, autoTour: false, modoPrevia: true, open: true }));
    await waitFor(() => expect(cartao()).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Ocultar' })).not.toBeInTheDocument();
    rerender(arvore({ token: null, tourKey: null, autoTour: false, modoPrevia: true, open: true, currentSection: 'contratos' }));
    act(() => avisarAcaoDoPortal('abriu-contrato'));
    await esperar(30);
    expect(markTour).not.toHaveBeenCalled();
  });

  it('item de aba oculta para o externo não entra', async () => {
    render(arvore({ visibleSections: ['dashboard', 'documentos'] }));
    await waitFor(() => expect(cartao()).not.toBeNull());
    expect(slot.textContent).toContain('0 de 1 feitos');
    expect(slot.textContent).toContain(item('enviar-documento').title);
    expect(slot.textContent).not.toContain(item('financeiro').title);
  });
});
