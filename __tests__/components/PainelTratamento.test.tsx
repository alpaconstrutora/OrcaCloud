// @vitest-environment jsdom
/** Tratamento individual (E7.1/E7.2): o dimensionamento, as unidades do plano, o filtro opcional, a conferência e o botão com o motivo. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelTratamento from '../../components/blueprint/PainelTratamento';
import { HIPOTESES_TRATAMENTO_PADRAO, type DimensionamentoDoTratamento, type PlanoDeTratamento } from '../../utils/blueprintTratamento';

const dim: DimensionamentoDoTratamento = {
  pessoas: 4, contribuicaoDiariaL: 520, C: 130, Lf: 1,
  tanque: { T: 1, K: 65, volumeL: 1780, comprimentoMm: 1800, larguraMm: 900, profundidadeUtilMm: 1200 },
  filtro: { T: 1, volumeUtilL: 1000, diametroMm: 1050, leitoMm: 1200 },
  sumidouro: { areaM2: 10.4, diametroMm: 1500, alturaUtilMm: 1850 },
  avisos: [],
};
const hip = HIPOTESES_TRATAMENTO_PADRAO;

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
    render(<PainelTratamento plano={plano} dim={dim} unidades={[]} hip={hip} onHip={vi.fn()} onLancar={onLancar} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('tratamento-dimensionamento').textContent).toContain('V = 1000 + N(C·T + K·Lf) = 1.780 L → 1,80 × 0,90 m, h útil 1,20 m');
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Tanque séptico 2,40 × 1,20 m, altura 1,80 m · tubo a -0,73 m');
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Sumidouro ø 1,50 m, altura 3,00 m');
    fireEvent.click(screen.getByTestId('tratamento-lancar'));
    expect(onLancar).toHaveBeenCalled();
  });

  it('o filtro opcional devolve a premissa; sem o que lançar, o motivo', () => {
    const onHip = vi.fn();
    render(<PainelTratamento plano={{ ...plano, motivo: 'O lote tem ligação à rede pública — o esgoto vai para ela; o tratamento individual não se aplica.', unidades: [], comandos: [] }} dim={dim} unidades={[{ terminalId: 'ts', tipo: 'TANQUE_SEPTICO', tem: 1080, precisa: 1780, unidade: 'L', atende: false }]} hip={hip} onHip={onHip} onLancar={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('tratamento-verificacao').textContent).toBe('Tanque séptico: tem 1.080 L, precisa 1.780 L — insuficiente');
    fireEvent.click(screen.getByLabelText('Com filtro anaeróbio entre o tanque e o sumidouro'));
    expect(onHip).toHaveBeenCalledWith({ ...hip, comFiltro: false });
    expect((screen.getByTestId('tratamento-lancar') as HTMLButtonElement).title).toMatch(/rede pública/);
  });
});
