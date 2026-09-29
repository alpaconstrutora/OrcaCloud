// @vitest-environment jsdom
/** Calhas (E6.2): o plano por beiral, o botão (com o motivo quando não há o que lançar) e a conferência. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelCalhas from '../../components/blueprint/PainelCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../../utils/blueprintPluvial';
import type { CalhaVerificada, PlanoDeCalhas } from '../../utils/blueprintCalhas';

const plano: PlanoDeCalhas = {
  motivo: null,
  calhas: [{ aguaId: 'a1', rotulo: 'Água 1 · Térreo', comprimentoM: 10, vazaoLMin: 115, secao: { secao: 'SEMICIRCULAR', larguraMm: 100, alturaMm: null }, capacidadeLMin: 129.5 }],
  jaTemCalha: 0,
  apagados: 0,
  avisos: [],
  comandos: [{ type: 'DeleteTrecho', trechoId: 'x' }],
};
const calhas: CalhaVerificada[] = [
  { trechoId: 't1', levelId: 'l', secao: { secao: 'RETANGULAR', larguraMm: 150, alturaMm: 75 }, comprimentoM: 12, declividadePct: 0.5, vazaoLMin: 600, capacidadeLMin: 486, declividadeOk: true, atende: false },
];

describe('PainelCalhas (E6.2)', () => {
  it('o plano por beiral e o lançamento', () => {
    const onLancar = vi.fn();
    render(<PainelCalhas plano={plano} calhas={[]} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onLancar={onLancar} onSelecionar={vi.fn()} />);
    expect(screen.getByText('meia-cana ø100 (130 L/min)')).toBeTruthy();
    fireEvent.click(screen.getByTestId('calhas-lancar'));
    expect(onLancar).toHaveBeenCalled();
  });

  it('sem o que lançar: o botão desliga e diz o motivo', () => {
    render(<PainelCalhas plano={{ ...plano, motivo: 'Desenhe o telhado (as águas, com o beiral) — a calha corre no beiral.', calhas: [], comandos: [] }} calhas={[]} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onLancar={vi.fn()} onSelecionar={vi.fn()} />);
    const botao = screen.getByTestId('calhas-lancar') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toMatch(/^Desenhe o telhado/);
  });

  it('a calha do desenho que não leva fica em vermelho; clicar seleciona; mudar a seção devolve as premissas', () => {
    const onSelecionar = vi.fn();
    const onHip = vi.fn();
    render(<PainelCalhas plano={plano} calhas={calhas} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={onHip} onLancar={vi.fn()} onSelecionar={onSelecionar} />);
    const linha = screen.getByText('retangular 150×75 · 12 m');
    expect(linha.closest('tr')!.className).toMatch(/red/);
    fireEvent.click(linha);
    expect(onSelecionar).toHaveBeenCalledWith(['t1']);
    fireEvent.change(screen.getByLabelText('Seção da calha'), { target: { value: 'RETANGULAR' } });
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_PLUVIAIS_PADRAO, secaoDaCalha: 'RETANGULAR' });
  });
});
