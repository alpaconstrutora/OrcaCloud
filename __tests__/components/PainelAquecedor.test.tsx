// @vitest-environment jsdom
/** Aquecedor de passagem (E8.1): o resultado em uma linha, a cor pela situação e as premissas. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelAquecedor from '../../components/blueprint/PainelAquecedor';
import { HIPOTESES_AQUECEDOR_PADRAO, type AquecedorDimensionado } from '../../utils/blueprintAquecedor';

const a: AquecedorDimensionado = {
  aquecedorId: 'aq', levelId: 't', pontos: 4, somaDePesos: 1.4, vazaoLMin: 21.3, deltaTC: 20, capacidadeNecessariaLMin: 21.3,
  modeloLMin: 27, pressaoNaEntradaKpa: 35.6, pressaoOk: true, atende: true, avisos: [],
};

describe('PainelAquecedor (E8.1)', () => {
  it('a linha do resultado, verde quando atende; clicar seleciona o aquecedor', () => {
    const onSelecionar = vi.fn();
    render(<PainelAquecedor aquecedores={[a]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={vi.fn()} onSelecionar={onSelecionar} />);
    const r = screen.getByTestId('aquecedor-resultado');
    expect(r.className).toMatch(/emerald/);
    expect(r.textContent).toContain('4 ponto(s), ΣP 1,40 → Q = 21,3 L/min; ΔT 20 °C pede 21,3 L/min nominais → aquecedor de 27 L/min; entrada 35,6 kPa (mín. 20).');
    fireEvent.click(screen.getByText('Aquecedor'));
    expect(onSelecionar).toHaveBeenCalledWith(['aq']);
  });

  it('sem modelo: vermelho e o aviso; mudar a temperatura de uso devolve as premissas', () => {
    const onHip = vi.fn();
    render(<PainelAquecedor aquecedores={[{ ...a, modeloLMin: null, atende: false, avisos: ['53 L/min passa do maior aquecedor de passagem da lista'] }]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={onHip} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('aquecedor-resultado').className).toMatch(/red/);
    expect(screen.getByText('53 L/min passa do maior aquecedor de passagem da lista')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Temperatura de uso da água quente em graus'), { target: { value: '45' } });
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_AQUECEDOR_PADRAO, temperaturaDeUsoC: 45 });
  });
});
