// @vitest-environment jsdom
/** Aquecedor de passagem (E8.1): o resultado em uma linha, a cor pela situação e as premissas. */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelAquecedor from '../../components/blueprint/PainelAquecedor';
import { HIPOTESES_AQUECEDOR_PADRAO, type AquecedorDimensionado } from '../../utils/blueprintAquecedor';

const a: AquecedorDimensionado = {
  aquecedorId: 'aq', levelId: 't', pontos: 4, somaDePesos: 1.4, vazaoLMin: 21.3, deltaTC: 20, capacidadeNecessariaLMin: 21.3,
  modeloLMin: 27, pressaoNaEntradaKpa: 35.6, pressaoOk: true, atende: true, avisos: [],
};

describe('PainelAquecedor (E8.1)', () => {
  beforeEach(() => localStorage.clear());

  it('a linha do resultado, verde quando atende; clicar seleciona o aquecedor', () => {
    const onSelecionar = vi.fn();
    render(<PainelAquecedor aquecedores={[a]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={vi.fn()} onSelecionar={onSelecionar} />);
    const r = screen.getByTestId('aquecedor-resultado');
    expect(r.className).toMatch(/emerald/);
    expect(r.textContent).toContain('4 ponto(s), ΣP 1,40 → Q = 21,3 L/min; ΔT 20 °C pede 21,3 L/min nominais → aquecedor de 27 L/min; entrada 35,6 kPa (mín. 20).');
    fireEvent.click(screen.getByText('Aquecedor'));
    expect(onSelecionar).toHaveBeenCalledWith(['aq']);
  });

  it('o resultado vem ANTES das premissas, que abrem recolhidas (14/10/2026)', () => {
    render(<PainelAquecedor aquecedores={[a]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={vi.fn()} onSelecionar={vi.fn()} />);
    const resultado = screen.getByTestId('aquecedor-resultado');
    const bloco = screen.getByTestId('hipoteses-aquecedor');
    expect(resultado.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bloco).toHaveTextContent('uso 40 °C · fria 20 °C · entrada ≥ 20 kPa');
    expect(screen.queryByLabelText('Temperatura de uso da água quente em graus')).toBeNull();
  });

  it('sem modelo: vermelho e o aviso; mudar a temperatura de uso devolve as premissas ao sair do campo', () => {
    const onHip = vi.fn();
    render(<PainelAquecedor aquecedores={[{ ...a, modeloLMin: null, atende: false, avisos: ['53 L/min passa do maior aquecedor de passagem da lista'] }]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={onHip} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('aquecedor-resultado').className).toMatch(/red/);
    expect(screen.getByText('53 L/min passa do maior aquecedor de passagem da lista')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /hipóteses do aquecedor/i }));
    const uso = screen.getByLabelText('Temperatura de uso da água quente em graus');
    fireEvent.change(uso, { target: { value: '45' } });
    fireEvent.blur(uso);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_AQUECEDOR_PADRAO, temperaturaDeUsoC: 45 });
  });

  it('apagar a temperatura da água fria NÃO grava 0 °C', () => {
    const onHip = vi.fn();
    render(<PainelAquecedor aquecedores={[a]} hip={HIPOTESES_AQUECEDOR_PADRAO} onHip={onHip} onSelecionar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /hipóteses do aquecedor/i }));
    const fria = screen.getByLabelText('Temperatura da água fria em graus');
    fireEvent.change(fria, { target: { value: '' } });
    fireEvent.blur(fria);
    expect(onHip).not.toHaveBeenCalled();
    expect(fria).toHaveValue(20);
  });
});
