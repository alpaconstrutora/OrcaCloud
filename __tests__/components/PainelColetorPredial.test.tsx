// @vitest-environment jsdom
/**
 * O coletor predial na gaveta de esgoto (E5.3; 14/10/2026 sem botão de lançar —
 * o "Lançar" do rodapé já lança ligação e coletor): a situação, a ligação
 * proposta e o "Confirmar cota" da rede estimada.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelColetorPredial from '../../components/blueprint/PainelColetorPredial';
import type { PlanoDoColetor } from '../../utils/blueprintColetorPredial';

const plano: PlanoDoColetor = {
  ligacaoId: 'lg', caixaId: 'ci', comandos: [], apagados: 0, comprimentoM: 8.2, uhc: 14, dnMm: 100,
  declividadePct: 1.5, declividadeMinimaPct: 1, caixasIntermediarias: 0, porGravidade: true, avisos: [], motivo: null,
  cotaEstimada: true, ligacaoProposta: null,
};

describe('PainelColetorPredial', () => {
  it('a situação e o "Confirmar cota" — sem botão de lançar', () => {
    const onConfirmarCota = vi.fn();
    render(<PainelColetorPredial plano={plano} profundidadeDaRedeMm={1500} onConfirmarCota={onConfirmarCota} />);
    expect(screen.getByTestId('coletor-situacao')).toHaveTextContent('Chega à rede por gravidade — DN 100 a 1,50 % (mín. 1 %).');
    expect(screen.queryByRole('button', { name: /lançar/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cota' }));
    expect(onConfirmarCota).toHaveBeenCalled();
  });

  it('sem ligação no desenho: diz que o "Lançar" do rodapé a põe na frente do lote', () => {
    const ligacaoProposta = { levelId: 't', at: { x: 0, y: 0 }, cotaMm: -1650, origem: 'FRENTE' } as unknown as PlanoDoColetor['ligacaoProposta'];
    render(<PainelColetorPredial plano={{ ...plano, ligacaoId: null, cotaEstimada: false, ligacaoProposta }} profundidadeDaRedeMm={1500} onConfirmarCota={vi.fn()} />);
    expect(screen.getByTestId('coletor-ligacao-proposta')).toHaveTextContent('o "Lançar" do rodapé a põe na frente do lote, com a rede estimada a −1,65 m');
  });
});
