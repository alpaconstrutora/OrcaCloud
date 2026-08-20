// @vitest-environment jsdom
/**
 * Painel "Seleção múltipla" (aba Ambientes do editor de plantas).
 *
 * Nasceu do pedido de 19/08/2026 — "selecionar todas as paredes e objetos e
 * mover ou selecionar parte e mover" (`docs/planos/
 * 2026-08-19-planta-inteligente-selecao-multipla-mover.md`).
 *
 * Testado SEPARADO do editor pela mesma razão do painel de parede: laçar e
 * arrastar exigem o canvas, opaco em jsdom. O que este arquivo cobre é a única
 * parte da seleção múltipla que NÃO é gesto — o deslocamento digitado, onde
 * mora a conversão de metro para milímetro. O gesto tem harness próprio,
 * `docs/spikes/mover-selecao/`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelSelecaoMultipla from '../../components/blueprint/PainelSelecaoMultipla';
import { point, type Wall } from '../../utils/blueprintKernel';
import type { FormaMedida } from '../../utils/blueprintMedicoes';

function parede(id: string, comprimentoMm: number): Wall {
  return {
    id,
    levelId: 'lvl_1',
    a: point(0, 0),
    b: point(comprimentoMm, 0),
    thicknessMm: 150,
    heightMm: 2800,
  };
}

function medicao(id: string): FormaMedida {
  return {
    id,
    tipo: 'POLIGONO',
    pontos: [point(0, 0), point(1000, 0), point(1000, 1000)],
    nome: 'Área',
    camada: 'Geral',
    cor: '#16a34a',
  };
}

function montar(over: Partial<React.ComponentProps<typeof PainelSelecaoMultipla>> = {}) {
  const props = {
    paredes: [parede('wal_1', 4000), parede('wal_2', 3000)],
    aberturas: 0,
    medicoes: [] as FormaMedida[],
    onMover: vi.fn(),
    onExcluir: vi.fn(),
    modo: 'MOVER' as const,
    ...over,
  };
  render(<PainelSelecaoMultipla {...props} />);
  return props;
}

describe('PainelSelecaoMultipla', () => {
  it('resume o conjunto por tipo e soma o comprimento das paredes', () => {
    montar({ aberturas: 3, medicoes: [medicao('med_1')] });
    expect(screen.getByText(/2 paredes/)).toBeTruthy();
    expect(screen.getByText(/3 aberturas/)).toBeTruthy();
    expect(screen.getByText(/1 medição/)).toBeTruthy();
    // 4,00 m + 3,00 m, com vírgula — a convenção do país, igual ao resto da tela.
    expect(screen.getByText(/7,00 m de parede/)).toBeTruthy();
  });

  it('converte o deslocamento digitado de METRO para MILÍMETRO', async () => {
    const usuario = userEvent.setup();
    const { onMover } = montar();

    const dx = screen.getByLabelText('Deslocamento horizontal em metros');
    await usuario.clear(dx);
    await usuario.type(dx, '2,5');
    await usuario.click(screen.getByRole('button', { name: /Mover/ }));

    // A borda converte; o kernel só conhece milímetro inteiro.
    expect(onMover).toHaveBeenCalledWith(2500, 0);
  });

  it('aceita deslocamento NEGATIVO — mover para trás é metade dos casos', async () => {
    const usuario = userEvent.setup();
    const { onMover } = montar();

    const dy = screen.getByLabelText('Deslocamento vertical em metros');
    await usuario.clear(dy);
    await usuario.type(dy, '-1.2');
    await usuario.click(screen.getByRole('button', { name: /Mover/ }));

    expect(onMover).toHaveBeenCalledWith(0, -1200);
  });

  it('texto sem número não move nada, em vez de mover zero', async () => {
    const usuario = userEvent.setup();
    const { onMover } = montar();

    const dx = screen.getByLabelText('Deslocamento horizontal em metros');
    await usuario.clear(dx);
    await usuario.type(dx, 'dois metros');
    await usuario.click(screen.getByRole('button', { name: /Mover/ }));

    expect(onMover).not.toHaveBeenCalled();
  });

  it('avisa que Desfazer não alcança a medição quando há medição na seleção', () => {
    montar({ medicoes: [medicao('med_1')] });
    // O aviso é a alternativa honesta a fingir que as duas camadas andam no
    // mesmo passo de histórico. Ver `useBlueprintMedicoes`.
    expect(screen.getByText(/Desfazer reverte só as paredes/)).toBeTruthy();
  });

  it('sem medição na seleção, não escreve o aviso — ele não se aplica', () => {
    montar();
    expect(screen.queryByText(/Desfazer reverte só as paredes/)).toBeNull();
  });
});
