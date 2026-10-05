// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E3 (04/10/2026) no painel do trecho/ponto: capacidade e
 * condensadora na evaporadora; sucção e isolamento na linha frigorígena;
 * isolamento no dreno e no duto — e nada disso no ponto de água.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelTrechoSelecionado from '../../components/blueprint/PainelTrechoSelecionado';
import type { Terminal, Trecho } from '../../utils/blueprintKernel';

const trecho = (disciplina: Trecho['disciplina'], extra: Partial<Trecho> = {}): Trecho => ({
  id: 't1', uid: 'u1', levelId: 'l1', disciplina, a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, ...extra,
});
const terminal = (disciplina: Terminal['disciplina'], tipoHidraulico: Terminal['tipoHidraulico'], extra: Partial<Terminal> = {}): Terminal => ({
  id: 'p1', uid: 'up1', levelId: 'l1', disciplina, tipo: String(tipoHidraulico), tipoHidraulico, at: { x: 0, y: 0 }, cotaMm: 2200, ...extra,
});

describe('PainelTrechoSelecionado › climatização', () => {
  it('evaporadora: capacidade (BTU/h) e a condensadora do sistema; sem condensadora o seletor avisa em vermelho', async () => {
    const onTerminal = vi.fn();
    render(
      <PainelTrechoSelecionado
        trecho={null}
        terminal={terminal('FRIGORIGENA', 'EVAPORADORA_HI_WALL')}
        onTrecho={() => {}}
        onTerminal={onTerminal}
        condensadoras={[{ id: 'c1', nome: 'CD-1 · 12.000 BTU/h' }]}
      />,
    );
    const cap = screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement;
    expect(cap.value).toBe('');
    fireEvent.change(cap, { target: { value: '12000' } });
    expect(onTerminal).toHaveBeenLastCalledWith({ capacidadeBtuH: 12000 });
    const sel = screen.getByLabelText('Condensadora desta evaporadora') as HTMLSelectElement;
    expect(sel.className).toMatch(/border-red-300/);
    expect(sel.options[0].textContent).toBe('Sem sistema');
    await userEvent.setup().selectOptions(sel, 'c1');
    expect(onTerminal).toHaveBeenLastCalledWith({ condensadoraId: 'c1' });
  });

  it('condensadora: tem capacidade, não tem seletor de condensadora; difusor não tem nenhum dos dois', () => {
    const r = render(<PainelTrechoSelecionado trecho={null} terminal={terminal('FRIGORIGENA', 'CONDENSADORA_SPLIT', { capacidadeBtuH: 18000 })} onTrecho={() => {}} onTerminal={() => {}} />);
    expect((screen.getByLabelText('Capacidade do equipamento (BTU/h)') as HTMLInputElement).value).toBe('18000');
    expect(screen.queryByLabelText('Condensadora desta evaporadora')).toBeNull();
    r.unmount();
    render(<PainelTrechoSelecionado trecho={null} terminal={terminal('MECANICA', 'DIFUSOR')} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByTestId('campo-capacidade')).toBeNull();
    expect(screen.queryByTestId('campo-condensadora')).toBeNull();
  });

  it('linha frigorígena: sucção (padrão = a de líquido) e isolamento; dreno e duto só isolamento; água fria nenhum', () => {
    const onTrecho = vi.fn();
    const r = render(<PainelTrechoSelecionado trecho={trecho('FRIGORIGENA')} terminal={null} onTrecho={onTrecho} onTerminal={() => {}} />);
    const succao = screen.getByLabelText('Diâmetro da linha de sucção, em milímetros') as HTMLInputElement;
    expect(succao.value).toBe('6');
    fireEvent.change(succao, { target: { value: '10' } });
    fireEvent.blur(succao);
    expect(onTrecho).toHaveBeenLastCalledWith({ bitolaSuccaoMm: 10 });
    const iso = screen.getByLabelText('Espessura do isolamento térmico, em milímetros') as HTMLInputElement;
    expect(iso.value).toBe('0');
    fireEvent.change(iso, { target: { value: '9' } });
    fireEvent.blur(iso);
    expect(onTrecho).toHaveBeenLastCalledWith({ isolamentoMm: 9 });
    expect((screen.getByLabelText('Material do tubo') as HTMLSelectElement).options[0].textContent).toBe('Padrão da rede (Cobre (classe E))');
    r.unmount();
    for (const d of ['DRENO_AC', 'MECANICA'] as const) {
      const rr = render(<PainelTrechoSelecionado trecho={trecho(d, { bitolaMm: 25 })} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
      expect(screen.queryByLabelText('Diâmetro da linha de sucção, em milímetros')).toBeNull();
      expect(screen.getByLabelText('Espessura do isolamento térmico, em milímetros')).toBeTruthy();
      rr.unmount();
    }
    render(<PainelTrechoSelecionado trecho={trecho('AGUA_FRIA', { bitolaMm: 25 })} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
    expect(screen.queryByLabelText('Diâmetro da linha de sucção, em milímetros')).toBeNull();
    expect(screen.queryByLabelText('Espessura do isolamento térmico, em milímetros')).toBeNull();
  });
});
