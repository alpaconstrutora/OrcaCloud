// @vitest-environment jsdom
/**
 * O MATERIAL no painel do trecho (28/09/2026, E1.1 do roadmap hidrossanitário):
 * só no cano de água, com o padrão da rede dito na opção vazia.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelTrechoSelecionado from '../../components/blueprint/PainelTrechoSelecionado';
import type { Trecho } from '../../utils/blueprintKernel';

const trecho = (disciplina: Trecho['disciplina']): Trecho => ({
  id: 't1', uid: 'u1', levelId: 'l1', disciplina, a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25,
});

describe('PainelTrechoSelecionado › material', () => {
  it('água fria: "Padrão da rede (PVC soldável)" e trocar para PPR chama onTrecho({ material })', async () => {
    const onTrecho = vi.fn();
    render(<PainelTrechoSelecionado trecho={trecho('AGUA_FRIA')} terminal={null} onTrecho={onTrecho} onTerminal={() => {}} />);
    const sel = screen.getByLabelText('Material do tubo') as HTMLSelectElement;
    expect(sel.options[0].textContent).toBe('Padrão da rede (PVC soldável)');
    await userEvent.setup().selectOptions(sel, 'PPR');
    expect(onTrecho).toHaveBeenCalledWith({ material: 'PPR' });
    await userEvent.setup().selectOptions(sel, '');
    expect(onTrecho).toHaveBeenLastCalledWith({ material: null });
  });

  it('água quente mostra o padrão CPVC; esgoto e eletroduto não têm o campo', () => {
    const { unmount } = render(<PainelTrechoSelecionado trecho={trecho('AGUA_QUENTE')} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
    expect((screen.getByLabelText('Material do tubo') as HTMLSelectElement).options[0].textContent).toBe('Padrão da rede (CPVC)');
    unmount();
    for (const d of ['ESGOTO', 'ELETRICA'] as const) {
      const r = render(<PainelTrechoSelecionado trecho={trecho(d)} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
      expect(screen.queryByLabelText('Material do tubo')).toBeNull();
      r.unmount();
    }
  });
});
