// @vitest-environment jsdom
/**
 * O painel de iluminação de emergência (01/10/2026, E7.3): o que falta por
 * tipo, os trechos sem luz, a autonomia curta; tudo certo em verde; o
 * espaçamento declarado grava.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelIluminacaoIncendio from '../../components/blueprint/PainelIluminacaoIncendio';
import { FONTE_ILUMINACAO, HIPOTESES_ILUMINACAO_PADRAO as HI, type AnaliseDeIluminacao } from '../../utils/blueprintIluminacaoEmergencia';

const a: AnaliseDeIluminacao = {
  espacamentoM: 15,
  luminarias: 1,
  pontosObrigatorios: [
    { levelId: 'l', at: { x: 0, y: 0 }, tipo: 'SAIDA', coberto: false },
    { levelId: 'l', at: { x: 9, y: 9 }, tipo: 'MUDANCA', coberto: false },
    { levelId: 'l', at: { x: 5, y: 5 }, tipo: 'MUDANCA', coberto: true },
  ],
  trechosSemLuz: [{ levelId: 'l', at: { x: 1, y: 1 } }],
  autonomiaCurta: ['le1'],
  fonte: FONTE_ILUMINACAO,
};

describe('PainelIluminacaoIncendio', () => {
  it('o que falta por tipo; a autonomia curta selecionável; propor lança', async () => {
    const onSelecionar = vi.fn();
    const onPropor = vi.fn();
    render(<PainelIluminacaoIncendio analise={a} hip={HI} onHip={vi.fn()} onSelecionar={onSelecionar} proposta={{ quantas: 3, onPropor }} />);
    const t = screen.getByTestId('iluminacao-falta').textContent!;
    expect(t).toContain('1 saída(s) sem luminária');
    expect(t).toContain('1 mudança(s) de direção sem luminária');
    expect(t).toContain('1 trecho(s) da rota longe demais de uma luminária');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: '1 luminária(s) com autonomia abaixo de 60 min' }));
    expect(onSelecionar).toHaveBeenCalledWith(['le1']);
    await u.click(screen.getByRole('button', { name: 'Propor 3 luminária(s)' }));
    expect(onPropor).toHaveBeenCalled();
  });

  it('tudo certo em verde, a proposta desligada; o espaçamento declarado grava', () => {
    const onHip = vi.fn();
    render(<PainelIluminacaoIncendio analise={{ ...a, pontosObrigatorios: [], trechosSemLuz: [], autonomiaCurta: [] }} hip={HI} onHip={onHip} onSelecionar={vi.fn()} proposta={{ quantas: 0, onPropor: vi.fn() }} />);
    expect(screen.getByTestId('iluminacao-ok').textContent).toContain('1 luminária(s)');
    expect(screen.getByRole('button', { name: 'Propor luminárias' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Espaçamento máximo das luminárias (m)'), { target: { value: '12' } });
    expect(onHip).toHaveBeenLastCalledWith({ espacamentoMaximoM: 12 });
  });
});
