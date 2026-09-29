// @vitest-environment jsdom
/** Águas pluviais (E6.1): a intensidade e de onde veio, as superfícies com a vazão, a pendência e as premissas. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelPluvial from '../../components/blueprint/PainelPluvial';
import { HIPOTESES_PLUVIAIS_PADRAO, type ContribuicaoPluvial } from '../../utils/blueprintPluvial';

const c: ContribuicaoPluvial = {
  superficies: [
    { tipo: 'AGUA', id: 'a1', levelId: 't', rotulo: 'Água 1 · Térreo', areaProjecaoM2: 40, inclinacaoPct: 30, areaContribuicaoM2: 46, vazaoLMin: 115, beiral: { a: { x: 0, y: 0 }, b: { x: 10000, y: 0 } } },
    { tipo: 'LAJE', id: 'l1', levelId: 't', rotulo: 'Laje descoberta 1 · Térreo', areaProjecaoM2: 12, inclinacaoPct: 0, areaContribuicaoM2: 12, vazaoLMin: 30, beiral: null },
  ],
  areaProjecaoTotalM2: 52,
  areaContribuicaoTotalM2: 58,
  intensidadeMmH: 150,
  origem: 'ATE_100M2',
  vazaoTotalLMin: 145,
  pendencias: [],
};

describe('PainelPluvial (E6.1)', () => {
  it('mostra a intensidade com a origem, as superfícies e o total; clicar seleciona a superfície', () => {
    const onSelecionar = vi.fn();
    render(<PainelPluvial c={c} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onSelecionar={onSelecionar} />);
    expect(screen.getByTestId('pluvial-intensidade').textContent).toBe('I = 150 mm/h — até 100 m² de projeção: 150 mm/h (NBR 10844, 5.1.4)');
    expect(screen.getByText('46,00 m²')).toBeTruthy();
    expect(screen.getByTestId('pluvial-vazao-total').textContent).toBe('145 L/min');
    fireEvent.click(screen.getByText('Laje descoberta 1 · Térreo'));
    expect(onSelecionar).toHaveBeenCalledWith(['l1']);
  });

  it('sem intensidade: a pendência aparece e a vazão fica em branco', () => {
    const sem = { ...c, intensidadeMmH: null, origem: null, vazaoTotalLMin: null, superficies: c.superficies.map((s) => ({ ...s, vazaoLMin: null })), pendencias: ['Projeção de 152 m² (acima de 100 m²): escolha a cidade ou informe a intensidade pluviométrica.'] };
    render(<PainelPluvial c={sem} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('pluvial-pendencia').textContent).toMatch(/escolha a cidade/);
    expect(screen.queryByTestId('pluvial-intensidade')).toBeNull();
    expect(screen.getByTestId('pluvial-vazao-total').textContent).toBe('—');
  });

  it('as premissas: cidade, período e a intensidade informada (vazio volta à tabela)', () => {
    const onHip = vi.fn();
    render(<PainelPluvial c={c} hip={{ ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 170 }} onHip={onHip} onSelecionar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Cidade da tabela de intensidades'), { target: { value: 'Salvador' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 170, cidade: 'Salvador' });
    fireEvent.change(screen.getByLabelText('Período de retorno'), { target: { value: '25' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 170, periodoDeRetornoAnos: 25 });
    fireEvent.change(screen.getByLabelText('Intensidade pluviométrica informada, em mm/h (vazio = tabela)'), { target: { value: '' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: null });
  });
});
