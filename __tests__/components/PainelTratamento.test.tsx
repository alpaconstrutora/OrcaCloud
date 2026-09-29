// @vitest-environment jsdom
/** Tratamento individual (E7.1): as unidades do plano, o filtro opcional e o botão com o motivo. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelTratamento from '../../components/blueprint/PainelTratamento';
import type { PlanoDeTratamento } from '../../utils/blueprintTratamento';

const plano: PlanoDeTratamento = {
  motivo: null,
  caixaId: 'ci',
  unidades: [
    { tipo: 'TANQUE_SEPTICO', at: { x: 8500, y: -1500 }, cotaMm: -725, medidas: { comprimentoMm: 2400, larguraMm: 1200, alturaMm: 1800 } },
    { tipo: 'SUMIDOURO', at: { x: 14450, y: -1500 }, cotaMm: -785, medidas: { comprimentoMm: 1500, larguraMm: 1500, alturaMm: 3000 } },
  ],
  apagados: 0,
  comandos: [{ type: 'DeleteTrecho', trechoId: 'x' }],
};

describe('PainelTratamento (E7.1)', () => {
  it('as unidades com as medidas e a cota do tubo; lançar', () => {
    const onLancar = vi.fn();
    render(<PainelTratamento plano={plano} hip={{ comFiltro: true }} onHip={vi.fn()} onLancar={onLancar} />);
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Tanque séptico 2,40 × 1,20 m, altura 1,80 m · tubo a -0,73 m');
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Sumidouro ø 1,50 m, altura 3,00 m');
    fireEvent.click(screen.getByTestId('tratamento-lancar'));
    expect(onLancar).toHaveBeenCalled();
  });

  it('o filtro opcional devolve a premissa; sem o que lançar, o motivo', () => {
    const onHip = vi.fn();
    render(<PainelTratamento plano={{ ...plano, motivo: 'O lote tem ligação à rede pública — o esgoto vai para ela; o tratamento individual não se aplica.', unidades: [], comandos: [] }} hip={{ comFiltro: true }} onHip={onHip} onLancar={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Com filtro anaeróbio entre o tanque e o sumidouro'));
    expect(onHip).toHaveBeenCalledWith({ comFiltro: false });
    expect((screen.getByTestId('tratamento-lancar') as HTMLButtonElement).title).toMatch(/rede pública/);
  });
});
