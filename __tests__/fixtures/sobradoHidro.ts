/**
 * O SOBRADO HIDROSSANITÁRIO de prova (28/09/2026): o banheiro repetido nos dois
 * andares, caixa d'água no teto do superior, CI no térreo — água e esgoto
 * lançados pelos PLANEJADORES, como o usuário faz. Usado pelo esquema vertical
 * (E2.3) e pelos memoriais (E3).
 */
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../../utils/blueprintKernel';
import { planejarAgua } from '../../utils/blueprintAguaAutomatica';
import { planejarEsgoto } from '../../utils/blueprintEsgotoAutomatico';

/** O banheiro repetido nos dois andares; caixa d'água no teto do superior; CI no térreo. */
export function sobrado(doisAndares = true): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (doisAndares) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const niveis = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0], [2000, 0, 2000, 3000]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }) as Command);
  const ponto = (levelId: string, disciplina: 'AGUA_FRIA' | 'ESGOTO', tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;
  const banheiro = (l: string): Command[] => [
    ponto(l, 'AGUA_FRIA', 'LAVATORIO', 75, 2500, 600),
    ponto(l, 'AGUA_FRIA', 'CHUVEIRO', 1500, 2925, 2100),
    ponto(l, 'AGUA_FRIA', 'VASO_SANITARIO', 75, 800, 300),
    ponto(l, 'ESGOTO', 'VASO_SANITARIO', 600, 800, 0),
    ponto(l, 'ESGOTO', 'LAVATORIO', 600, 2500, 500),
    ponto(l, 'ESGOTO', 'CHUVEIRO', 1500, 2500, 0),
    ponto(l, 'ESGOTO', 'CAIXA_SIFONADA', 1200, 2100, 0),
  ];
  m = applyBatch(m, [
    ...niveis.flatMap(paredes),
    { type: 'AddTerminal', levelId: niveis[niveis.length - 1], disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(4500, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' } as Command,
    ...niveis.flatMap(banheiro),
    ponto(niveis[0], 'ESGOTO', 'CAIXA_INSPECAO', 6000, -1500, -700),
  ]).model;
  m = recomputeSpaces(m);
  m = applyBatch(m, planejarAgua(m, m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!).comandos).model;
  return applyBatch(m, planejarEsgoto(m).comandos).model;
}
