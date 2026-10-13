/**
 * A CASA NO LOTE, SEM CAIXA NEM LIGAÇÃO (13/10/2026) — a prova das âncoras
 * automáticas da hidráulica (docs/planos/2026-10-13-hidro-ancoras-automaticas.md).
 *
 * A casa: 4,5 × 3 m (paredes de 15 cm), parede interna em x = 2000, o banheiro
 * à esquerda. A saída do esgoto é o VASO, em (600, 800): é a fonte de maior UHC.
 * O lote: de (−3000, frenteY) a (7500, 6000), frente ao SUL (padrão y = −8000);
 * `frenteY: null` = sem divisas.
 */
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../../utils/blueprintKernel';

export function casa(opcoes: { doisAndares?: boolean; frenteY?: number | null; semAparelhos?: boolean; ciEm?: { x: number; y: number } } = {}): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (opcoes.doisAndares) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const niveis = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0], [2000, 0, 2000, 3000]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }) as Command);
  const ponto = (levelId: string, tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;
  const banheiro = (l: string): Command[] => [
    ponto(l, 'VASO_SANITARIO', 600, 800, 0),
    ponto(l, 'LAVATORIO', 600, 2500, 500),
    ponto(l, 'CHUVEIRO', 1500, 2500, 0),
    ponto(l, 'CAIXA_SIFONADA', 1200, 2100, 0),
  ];
  m = applyBatch(m, [...niveis.flatMap(paredes), ...(opcoes.semAparelhos ? [] : niveis.flatMap(banheiro))]).model;
  if (opcoes.ciEm) m = applyCommand(m, ponto(niveis[0], 'CAIXA_INSPECAO', opcoes.ciEm.x, opcoes.ciEm.y, -700)).model;
  const frenteY = opcoes.frenteY === undefined ? -8000 : opcoes.frenteY;
  if (frenteY != null) {
    const cantos: [number, number][] = [[-3000, frenteY], [7500, frenteY], [7500, 6000], [-3000, 6000]];
    m = applyBatch(m, cantos.map(([ax, ay], i): Command => {
      const [bx, by] = cantos[(i + 1) % 4];
      return { type: 'AddBoundary', levelId: niveis[0], a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(i === 0 ? { papel: 'FRENTE' as const } : {}) };
    })).model;
  }
  return recomputeSpaces(m);
}
