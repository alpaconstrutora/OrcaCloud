// @vitest-environment jsdom
/**
 * Cartão "Primeiros passos" (tour v2, F8 — 04/10/2026).
 * docs/planos/2026-10-04-tour-guiado-v2-portais.md
 *
 * Só desenho: contagem, barra, "Ir" leva à aba do item, "Ocultar" avisa, e o
 * cartão some quando tudo está feito ou não há item.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { PortalChecklist } from '../../components/portal/PortalChecklist';
import { mergePortalHelp } from '../../utils/portalHelpDefaults';

const itens = mergePortalHelp('parceiro', null).checklist;

describe('PortalChecklist', () => {
  it('mostra "x de n feitos", marca os feitos e oferece "Ir" só nos que faltam', async () => {
    const user = userEvent.setup();
    const onIr = vi.fn();
    render(<PortalChecklist portal="parceiro" itens={itens} feitos={new Set([itens[0].key])} onIr={onIr} onOcultar={vi.fn()} />);
    expect(screen.getByText(`1 de ${itens.length} feitos`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    const feito = screen.getByText(itens[0].title).closest('li')!;
    expect(within(feito).getByLabelText('Feito')).toBeInTheDocument();
    expect(within(feito).queryByRole('button', { name: /Ir/ })).not.toBeInTheDocument();
    const aFazer = screen.getByText(itens[2].title).closest('li')!;
    await user.click(within(aFazer).getByRole('button', { name: /Ir/ }));
    expect(onIr).toHaveBeenCalledWith(itens[2].section);
  });

  it('"Ocultar" avisa e explica que volta pela Ajuda; sem onOcultar (prévia) não aparece', async () => {
    const user = userEvent.setup();
    const onOcultar = vi.fn();
    const { rerender } = render(<PortalChecklist portal="parceiro" itens={itens} feitos={new Set()} onOcultar={onOcultar} />);
    const ocultar = screen.getByRole('button', { name: 'Ocultar' });
    expect(ocultar).toHaveAttribute('title', 'Esconde este cartão; ele volta pela Ajuda');
    await user.click(ocultar);
    expect(onOcultar).toHaveBeenCalled();
    rerender(<PortalChecklist portal="parceiro" itens={itens} feitos={new Set()} />);
    expect(screen.queryByRole('button', { name: 'Ocultar' })).not.toBeInTheDocument();
  });

  it('some quando tudo está feito ou quando não há item', () => {
    const { container, rerender } = render(<PortalChecklist portal="parceiro" itens={itens} feitos={new Set(itens.map(i => i.key))} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PortalChecklist portal="parceiro" itens={[]} feitos={new Set()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
