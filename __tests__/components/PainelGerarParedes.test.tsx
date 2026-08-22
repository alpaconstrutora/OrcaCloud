// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PainelGerarParedes from '../../components/blueprint/PainelGerarParedes';
import type { Underlay } from '../../utils/blueprintUnderlay';

/**
 * A recusa por falta de escala.
 *
 * Nasceu de um caso real: o usuário importou uma prancha, não aferiu, gerou, e
 * o modelo ganhou 13 paredes somando 2,5 m com espessuras de 5, 6, 8, 9, 10 e
 * 11 cm. Nenhuma delas é parede. O painel AVISAVA e gerava assim mesmo — e um
 * resultado errado que parece plausível é pior que nenhum resultado.
 */
const UNDERLAY: Underlay = {
  origemXMm: 0,
  origemYMm: 0,
  mmPorPixel: 1,
  rotacaoMrad: 0,
};

const base = {
  underlay: UNDERLAY,
  temFundo: true,
  pranchaId: 'u1',
  limitesDaVista: null,
  onExtrair: vi.fn(),
  onVetorGuardado: vi.fn().mockResolvedValue(null),
  onRegravar: vi.fn(),
  onGerar: vi.fn(),
  ocupado: false,
};

describe('PainelGerarParedes · sem escala não gera', () => {
  it('RECUSA, e diz o que fazer', async () => {
    render(<PainelGerarParedes {...base} semAfericao />);
    expect(
      await screen.findByText(/escala desta prancha não foi estabelecida/i),
    ).toBeInTheDocument();
    // Não basta avisar: não pode haver botão de gerar.
    expect(screen.queryByRole('button', { name: /gerar/i })).not.toBeInTheDocument();
  });

  it('com escala estabelecida, a recusa some', async () => {
    render(<PainelGerarParedes {...base} semAfericao={false} />);
    expect(
      screen.queryByText(/escala desta prancha não foi estabelecida/i),
    ).not.toBeInTheDocument();
  });

  it('sem fundo, pede o fundo antes de qualquer coisa', () => {
    render(<PainelGerarParedes {...base} temFundo={false} semAfericao />);
    expect(screen.getByText(/importe a planta de fundo/i)).toBeInTheDocument();
  });
});
