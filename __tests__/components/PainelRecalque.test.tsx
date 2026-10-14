// @vitest-environment jsdom
/**
 * O recalque na gaveta de água (E4.4; premissas recolhidas e cota do percurso
 * em 14/10/2026): a bomba em uma linha, o botão e as premissas — gravadas ao
 * sair do campo, com o rendimento aceitando 0,65.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelRecalque from '../../components/blueprint/PainelRecalque';
import { HIPOTESES_RECALQUE_PADRAO, type PlanoDoRecalque } from '../../utils/blueprintRecalque';

const plano: PlanoDoRecalque = {
  inferiorId: 'inf', superiorId: 'sup', comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }] as never, apagados: 0, confirmados: 0,
  vazaoLs: 0.056, diametroForchheimerMm: 19.8, dnRecalqueMm: 25, dnSuccaoMm: 32, comprimentoRecalqueM: 14.2, comprimentoSuccaoM: 1.5,
  velocidadeRecalqueMs: 0.2, desnivelGeometricoM: 8.4, perdasMca: 0.6, alturaManometricaM: 9, potenciaCv: 0.14, motorCv: 0.25, avisos: [], motivo: null,
};

const abrirHipoteses = () => fireEvent.click(screen.getByRole('button', { name: /hipóteses do recalque/i }));

describe('PainelRecalque', () => {
  beforeEach(() => localStorage.clear());

  it('a bomba e as premissas recolhidas com o resumo — sem botão de lançar (14/10/2026: é do "Lançar tudo" da gaveta)', () => {
    render(<PainelRecalque plano={plano} hip={HIPOTESES_RECALQUE_PADRAO} onHip={vi.fn()} />);
    expect(screen.getByTestId('recalque-bomba')).toHaveTextContent('Bomba de 0,25 cv');
    expect(screen.getByTestId('hipoteses-recalque')).toHaveTextContent('6 h/dia · rendimento 0,50 · percurso a 2200 mm');
    expect(screen.queryByRole('button', { name: /lançar/i })).toBeNull();
  });

  it('digitar 0,65 no rendimento grava 0,65 (antes o primeiro "0" virava 0,20 na hora)', () => {
    const onHip = vi.fn();
    render(<PainelRecalque plano={plano} hip={HIPOTESES_RECALQUE_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    const rendimento = screen.getByLabelText('Rendimento do conjunto motor-bomba');
    fireEvent.change(rendimento, { target: { value: '0' } });
    expect(onHip).not.toHaveBeenCalled();
    expect(rendimento).toHaveValue(0);
    fireEvent.change(rendimento, { target: { value: '0.65' } });
    fireEvent.blur(rendimento);
    expect(onHip).toHaveBeenCalledTimes(1);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RECALQUE_PADRAO, rendimento: 0.65 });
  });

  it('a cota do percurso virou campo (era constante escondida)', () => {
    const onHip = vi.fn();
    render(<PainelRecalque plano={plano} hip={HIPOTESES_RECALQUE_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    const cota = screen.getByLabelText('Cota do percurso do recalque em mm');
    fireEvent.change(cota, { target: { value: '2600' } });
    fireEvent.blur(cota);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RECALQUE_PADRAO, cotaDoPercursoMm: 2600 });
  });

  it('com motivo: o aviso no lugar da bomba', () => {
    const motivo = 'Há reservatório inferior mas não há o superior para onde recalcar.';
    render(<PainelRecalque plano={{ ...plano, motivo, comandos: [] }} hip={HIPOTESES_RECALQUE_PADRAO} onHip={vi.fn()} />);
    expect(screen.queryByTestId('recalque-bomba')).toBeNull();
    expect(screen.getByText(motivo)).toBeInTheDocument();
  });
});
