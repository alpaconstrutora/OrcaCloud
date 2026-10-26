// @vitest-environment jsdom
/**
 * Gerar massa › "Seguir o Empreendimento" (26/10/2026, etapa 1 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md):
 * a caixa mostra as torres, liga por padrão, desliga com o motivo e a restrição chega ao gerador.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TelaGeradorDeMassa from '../../components/blueprint/TelaGeradorDeMassa';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { ZONA_DA_MASSA_VAZIA } from '../../utils/blueprintMassa';
import { produtoSemente } from '../../utils/blueprintProduto';
import { massaDoEmpreendimento } from '../../utils/blueprintMassaDoEmpreendimento';
import type { EstadoDoGeradorDeMassa } from '../../hooks/useGeradorDeMassa';
import type { EntradaDoGeradorDeMassa } from '../../utils/blueprintGeradorDeMassa';

function lote(): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  return applyBatch(m, [d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA')]).model;
}
const REGUA: EntradaDoGeradorDeMassa['regua'] = {
  zona: { ...ZONA_DA_MASSA_VAZIA, gabaritoPavimentos: 12 },
  recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
  produto: produtoSemente('RESIDENCIAL_MEDIO'),
  cub: null,
  vagasPorUnidadeDaZona: null,
};
const gerador = (): EstadoDoGeradorDeMassa => ({ rodando: false, resultado: null, erro: null, gerar: vi.fn(), cancelar: vi.fn(), limpar: vi.fn() });

function tela(empreendimento: React.ComponentProps<typeof TelaGeradorDeMassa>['empreendimento']) {
  const g = gerador();
  render(<TelaGeradorDeMassa gerador={g} model={lote()} regua={REGUA} proximoNumero={1} onAbrirProduto={vi.fn()} onCriarAlternativa={vi.fn()} onAplicar={vi.fn()} empreendimento={empreendimento} />);
  return g;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* sem storage */
  }
});
afterEach(cleanup);

describe('TelaGeradorDeMassa › Seguir o Empreendimento', () => {
  it('sem Empreendimento ligado, a caixa não aparece e o gerador vai livre', () => {
    const g = tela(null);
    expect(screen.queryByTestId('seguir-empreendimento')).toBeNull();
    fireEvent.click(screen.getByTestId('gerar-massa'));
    expect((g.gerar as ReturnType<typeof vi.fn>).mock.calls[0][0].restricoes.doEmpreendimento).toBeNull();
  });

  it('com torres: ligada por padrão, mostra o resumo e a restrição chega ao gerador; desligar solta', () => {
    const g = tela({ nome: 'Garden', massa: massaDoEmpreendimento([{ name: 'A', floors_count: 12 }, { name: 'B', floors_count: 12 }]) });
    const caixa = screen.getByTestId('seguir-empreendimento') as HTMLInputElement;
    expect(caixa.checked).toBe(true);
    expect(caixa.closest('label')!.textContent).toMatch(/Seguir o Empreendimento "Garden": 2 torres × 12 pavimentos/);
    fireEvent.click(screen.getByTestId('gerar-massa'));
    expect((g.gerar as ReturnType<typeof vi.fn>).mock.calls[0][0].restricoes.doEmpreendimento).toEqual({ torres: 2, pavimentosMin: 12, pavimentosMax: 12 });
    fireEvent.click(caixa);
    fireEvent.click(screen.getByTestId('gerar-massa'));
    expect((g.gerar as ReturnType<typeof vi.fn>).mock.calls[1][0].restricoes.doEmpreendimento).toBeNull();
  });

  it('sem torres próprias: desligada, com o motivo', () => {
    tela({ nome: 'Garden', massa: massaDoEmpreendimento([]) });
    const caixa = screen.getByTestId('seguir-empreendimento') as HTMLInputElement;
    expect(caixa.disabled).toBe(true);
    expect(caixa.checked).toBe(false);
    expect(screen.getByTestId('avisos-seguir-empreendimento').textContent).toMatch(/não tem torres/);
  });
});
