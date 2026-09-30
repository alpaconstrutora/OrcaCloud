// @vitest-environment jsdom
/**
 * INCÊNDIO E1.4 (30/09/2026): no painel do ponto, o NÚMERO da peça (derivado ou
 * declarado) e, no sprinkler, o fator K e a posição — que existiam no modelo
 * desde a E1.1 sem campo na tela. E o material da rede de incêndio (E1.2).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelTrechoSelecionado from '../../components/blueprint/PainelTrechoSelecionado';
import type { Terminal, Trecho } from '../../utils/blueprintKernel';

const ponto = (tipoHidraulico: Terminal['tipoHidraulico'], extra: Partial<Terminal> = {}): Terminal => ({
  id: 'p1', uid: 'u1', levelId: 'l1', disciplina: 'INCENDIO', tipo: String(tipoHidraulico), at: { x: 0, y: 0 }, cotaMm: 2700, tipoHidraulico, ...extra,
});

describe('PainelTrechoSelecionado › peça de incêndio', () => {
  it('sprinkler: K e posição editáveis; o padrão da ficha (K 80, pendente) volta como null', async () => {
    const onTerminal = vi.fn();
    render(<PainelTrechoSelecionado trecho={null} terminal={ponto('SPRINKLER')} onTrecho={() => {}} onTerminal={onTerminal} numeroDeIncendio={{ numero: 'SPK-3', origem: 'DERIVADO' }} />);
    const k = screen.getByLabelText('Fator K do sprinkler') as HTMLSelectElement;
    expect(k.options[0].textContent).toBe('Padrão (80)');
    await userEvent.setup().selectOptions(k, '115');
    expect(onTerminal).toHaveBeenLastCalledWith({ fatorK: 115 });
    await userEvent.setup().selectOptions(screen.getByLabelText('Posição do sprinkler'), 'EM_PE');
    expect(onTerminal).toHaveBeenLastCalledWith({ posicaoSprinkler: 'EM_PE' });
    expect(screen.getByTestId('numero-de-incendio').textContent).toMatch(/SPK-3 — derivado da posição/);
  });

  it('hidrante: número declarado, e nada de K', () => {
    render(<PainelTrechoSelecionado trecho={null} terminal={ponto('HIDRANTE_SIMPLES', { rotulo: 'H-1' })} onTrecho={() => {}} onTerminal={() => {}} numeroDeIncendio={{ numero: 'H-1', origem: 'DECLARADO' }} />);
    expect(screen.getByTestId('numero-de-incendio').textContent).toMatch(/H-1 — declarado/);
    expect(screen.queryByLabelText('Fator K do sprinkler')).toBeNull();
  });

  it('tubo de incêndio: material com o padrão aço galvanizado e só os materiais da rede', () => {
    const trecho: Trecho = { id: 't1', uid: 'u1', levelId: 'l1', disciplina: 'INCENDIO', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65 };
    render(<PainelTrechoSelecionado trecho={trecho} terminal={null} onTrecho={() => {}} onTerminal={() => {}} />);
    const sel = screen.getByLabelText('Material do tubo') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual([
      'Padrão da rede (Aço galvanizado)', 'Aço galvanizado', 'Aço carbono SCH 40', 'CPVC para sprinkler (SDR 13,5)', 'Cobre (classe E)',
    ]);
  });
});
