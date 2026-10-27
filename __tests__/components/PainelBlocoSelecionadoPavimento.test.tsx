// @vitest-environment jsdom
/**
 * PAVIMENTO CLICÁVEL NA MASSA (27/10/2026): *"permitir clicar em cada pavimento e identificar em propriedades"*.
 * O painel do bloco mostra o piso em destaque (clicado no 3D ou escolhido nos botões) com os dados dele.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelBlocoSelecionado from '../../components/blueprint/PainelBlocoSelecionado';
import type { Bloco } from '../../utils/blueprintKernel';
import type { MedidaDoBloco, PisoDoBloco } from '../../utils/blueprintMassa';

const BLOCO = {
  id: 'b1',
  uid: 'u-b1',
  levelId: 'l0',
  nome: 'Torre A',
  uso: 'RESIDENCIAL',
  pontos: [{ x: 0, y: 0 }, { x: 11000, y: 0 }, { x: 11000, y: 16000 }],
  cotaBaseMm: 0,
  pavimentos: 3,
  peDireitoMm: 3000,
} as unknown as Bloco;

const piso = (indice: number, extra: Partial<PisoDoBloco> = {}): PisoDoBloco => ({
  indice,
  baseMm: (indice - 1) * 3000,
  topoMm: indice * 3000,
  subsolo: false,
  ordinal: indice,
  acimaDoGabarito: false,
  motivoDoGabarito: null,
  pecasDoEnvelope: [],
  cabe: true,
  areaForaMm2: 0,
  afastamentoMm: null,
  ...extra,
});

const MEDIDA: MedidaDoBloco = {
  blocoId: 'b1',
  nome: 'Torre A',
  uso: 'RESIDENCIAL',
  projecaoM2: 176,
  pavimentos: 3,
  pavimentosNoSubsolo: 0,
  areaConstruidaM2: 528,
  areaComputavelM2: 528,
  areaNaoComputavelM2: 0,
  baseMm: 0,
  topoMm: 9000,
  alturaM: 9,
  pisos: [piso(1), piso(2), piso(3, { acimaDoGabarito: true, motivoDoGabarito: 'Passa de 6,00 m' })],
  pisosAcimaDoGabarito: 1,
  pisosForaDoEnvelope: 0,
  apoiadoEm: null,
};

const montar = (pisoSelecionado: number | null, onPiso = vi.fn()) => {
  render(<PainelBlocoSelecionado bloco={BLOCO} medida={MEDIDA} onProps={vi.fn()} onExcluir={vi.fn()} onAbrirEstudo={vi.fn()} pisoSelecionado={pisoSelecionado} onPiso={onPiso} />);
  return onPiso;
};

describe('painel do bloco › pavimento', () => {
  it('sem pavimento em destaque: um botão por piso e o convite a clicar', () => {
    montar(null);
    expect(screen.getAllByRole('button', { name: /º$/ }).map((b) => b.textContent)).toEqual(['1º', '2º', '3º']);
    expect(screen.getByTestId('pavimento-do-bloco')).toHaveTextContent('Clique num pavimento no 3D');
  });

  it('o piso clicado no 3D aparece identificado, com cotas, área e conferência', () => {
    montar(3);
    expect(screen.getByRole('button', { name: '3º' })).toHaveAttribute('aria-pressed', 'true');
    const r = screen.getByTestId('resumo-do-pavimento');
    expect(r).toHaveTextContent('Torre A · 3º pavimento de 3');
    expect(r).toHaveTextContent('Cota 6,00 m a 9,00 m · 176,00 m²');
    expect(r).toHaveTextContent('Acima do gabarito: Passa de 6,00 m');
  });

  it('escolher no painel avisa o editor; clicar no escolhido desmarca', async () => {
    const onPiso = montar(2);
    await userEvent.click(screen.getByRole('button', { name: '1º' }));
    expect(onPiso).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: '2º' }));
    expect(onPiso).toHaveBeenLastCalledWith(null);
  });
});
