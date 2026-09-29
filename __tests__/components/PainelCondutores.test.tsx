// @vitest-environment jsdom
/** Condutores (E6.3): o resumo do plano, o botão com o motivo e a conferência que aponta os que não atendem. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelCondutores from '../../components/blueprint/PainelCondutores';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../../utils/blueprintPluvial';
import type { CondutorVerificado, PlanoDeCondutores } from '../../utils/blueprintCondutoresPluviais';

const plano: PlanoDeCondutores = { motivo: null, fontes: 2, verticais: 2, horizontais: 3, apagados: 0, avisos: ['a saída pluvial está alta demais'], comandos: [{ type: 'DeleteTrecho', trechoId: 'x' }] };
const ok: CondutorVerificado = { trechoId: 'a', levelId: 'l', vertical: true, dnMm: 75, vazaoLMin: 115, capacidadeLMin: 297, declividadePct: null, declividadeOk: true, atende: true };

describe('PainelCondutores (E6.3)', () => {
  it('o resumo, o aviso e o lançamento', () => {
    const onLancar = vi.fn();
    render(<PainelCondutores plano={plano} condutores={[ok]} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onLancar={onLancar} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('condutores-plano').textContent).toBe('2 bocal(is) ou ralo(s): 2 condutor(es) vertical(is) e 3 horizontal(is) até a caixa de areia e a saída.');
    expect(screen.getByText('a saída pluvial está alta demais')).toBeTruthy();
    expect(screen.getByTestId('condutores-verificacao').textContent).toBe('1 trecho(s) conferido(s); o maior leva 115 L/min.');
    fireEvent.click(screen.getByTestId('condutores-lancar'));
    expect(onLancar).toHaveBeenCalled();
  });

  it('sem o que lançar, o botão diz o motivo; os que não atendem se selecionam de uma vez', () => {
    const onSelecionar = vi.fn();
    const ruim = { ...ok, trechoId: 'b', dnMm: 50, atende: false };
    render(<PainelCondutores plano={{ ...plano, motivo: 'Lance as calhas (o condutor desce do bocal) ou ponha um ralo pluvial.', comandos: [] }} condutores={[ok, ruim]} hip={HIPOTESES_PLUVIAIS_PADRAO} onHip={vi.fn()} onLancar={vi.fn()} onSelecionar={onSelecionar} />);
    expect((screen.getByTestId('condutores-lancar') as HTMLButtonElement).title).toMatch(/^Lance as calhas/);
    fireEvent.click(screen.getByText('Selecionar'));
    expect(onSelecionar).toHaveBeenCalledWith(['b']);
  });
});
