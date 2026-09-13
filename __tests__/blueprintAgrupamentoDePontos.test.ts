/**
 * Agrupamento dos pontos elétricos (13/09/2026): a MESMA regra de pertencimento
 * da conferência NBR 5410, com o critério escolhido pelo usuário e "ambiente"
 * como o sugerido.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import {
  CRITERIO_SUGERIDO,
  FORA_DE_AMBIENTE,
  agruparPontos,
  ambienteDoPonto,
} from '../utils/blueprintAgrupamentoDePontos';

/** Sala (0–6 m) e quarto (6–9 m) no térreo; três pontos na sala, um no quarto, um fora. */
function casa() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 9000, 0), p(9000, 0, 9000, 4000), p(9000, 4000, 0, 4000), p(0, 4000, 0, 0), p(6000, 0, 6000, 4000)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[1].id, name: 'Quarto' }).model;
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR' | null) => {
    m = applyCommand(m, {
      type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico ?? 'Ponto', at: point(x, y), cotaMm: 300, tipoEletrico,
    }).model;
  };
  ponto(1000, 200, 'TUG');
  ponto(3000, 2000, 'ILUMINACAO_TETO');
  ponto(2000, 200, 'INTERRUPTOR');
  ponto(7500, 2000, 'TUG');
  ponto(12000, 2000, null); // fora de qualquer ambiente, sem tipo
  return m;
}

const itens = (m: ReturnType<typeof casa>) => m.terminais!.map((t) => ({ terminalId: t.id, rotulo: t.tipo }));

describe('agruparPontos', () => {
  it('o sugerido é "ambiente"; agrupa pela regra da conferência, na ordem do pavimento, com "Fora de ambiente" por último', () => {
    expect(CRITERIO_SUGERIDO).toBe('ambiente');
    const m = casa();
    const grupos = agruparPontos(m, itens(m), 'ambiente');
    expect(grupos.map((g) => [g.titulo, g.itens.length])).toEqual([
      ['Ambiente 1', 3], // a sala, sem nome
      ['Quarto', 1],
      [FORA_DE_AMBIENTE, 1],
    ]);
    expect(ambienteDoPonto(m, m.terminais![3])?.nome).toBe('Quarto');
    expect(ambienteDoPonto(m, m.terminais![4])).toBeNull();
  });

  it('por tipo: iluminação, tomadas, interruptores, "A classificar" — na ordem da taxonomia', () => {
    const m = casa();
    const grupos = agruparPontos(m, itens(m), 'tipo');
    expect(grupos.map((g) => [g.titulo, g.itens.length])).toEqual([
      ['iluminação', 1],
      ['tomadas', 2],
      ['interruptores', 1],
      ['A classificar', 1],
    ]);
  });

  it('por pavimento e sem agrupar', () => {
    const m = casa();
    expect(agruparPontos(m, itens(m), 'pavimento').map((g) => [g.titulo, g.itens.length])).toEqual([['Térreo', 5]]);
    const liso = agruparPontos(m, itens(m), 'nenhum');
    expect(liso).toHaveLength(1);
    expect(liso[0].titulo).toBe('');
    expect(liso[0].itens).toHaveLength(5);
    expect(agruparPontos(m, [], 'nenhum')).toEqual([]);
  });
});
