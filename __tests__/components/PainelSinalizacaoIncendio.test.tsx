// @vitest-environment jsdom
/**
 * O painel de sinalização (01/10/2026, E7.2): o que falta, com seleção; tudo
 * certo em verde; a proposta desligada sem nada a sinalizar.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelSinalizacaoIncendio from '../../components/blueprint/PainelSinalizacaoIncendio';
import { FONTE_SINALIZACAO, type AnaliseDeSinalizacao } from '../../utils/blueprintSinalizacao';

const base: AnaliseDeSinalizacao = { equipamentosSemPlaca: [], placasOrfas: [], placasSemCodigo: [], pontosDaRota: [], fonte: FONTE_SINALIZACAO };

describe('PainelSinalizacaoIncendio', () => {
  it('o que falta: equipamentos sem placa (selecionáveis), placa órfã e os pontos da rota', async () => {
    const onSelecionar = vi.fn();
    const onPropor = vi.fn();
    const a: AnaliseDeSinalizacao = {
      ...base,
      equipamentosSemPlaca: ['e1', 'e2'],
      placasOrfas: ['p9'],
      pontosDaRota: [
        { levelId: 'l', at: { x: 0, y: 0 }, codigo: 'S12', rotacaoGraus: 270, coberto: false },
        { levelId: 'l', at: { x: 5, y: 5 }, codigo: 'S3', rotacaoGraus: 0, coberto: false },
        { levelId: 'l', at: { x: 9, y: 9 }, codigo: 'S3', rotacaoGraus: 0, coberto: true },
      ],
    };
    render(<PainelSinalizacaoIncendio analise={a} onSelecionar={onSelecionar} proposta={{ quantas: 4, onPropor }} />);
    const t = screen.getByTestId('sinalizacao-falta').textContent!;
    expect(t).toContain('2 equipamento(s) sem placa');
    expect(t).toContain('1 placa(s) sem equipamento (ele foi apagado)');
    expect(t).toContain('2 de 3 ponto(s) da rota sem placa (1 saída(s), 1 mudança(s) de direção)');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: '2 equipamento(s) sem placa' }));
    expect(onSelecionar).toHaveBeenCalledWith(['e1', 'e2']);
    await u.click(screen.getByRole('button', { name: 'Propor 4 placa(s)' }));
    expect(onPropor).toHaveBeenCalled();
  });

  it('tudo sinalizado: verde, e a proposta desligada com o motivo', () => {
    render(<PainelSinalizacaoIncendio analise={{ ...base, pontosDaRota: [{ levelId: 'l', at: { x: 0, y: 0 }, codigo: 'S12', rotacaoGraus: 0, coberto: true }] }} onSelecionar={vi.fn()} proposta={{ quantas: 0, onPropor: vi.fn() }} />);
    expect(screen.getByTestId('sinalizacao-ok').textContent).toContain('1 ponto(s) da rota com placa');
    const b = screen.getByRole('button', { name: 'Propor placas' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toBe('nada a sinalizar');
  });
});
