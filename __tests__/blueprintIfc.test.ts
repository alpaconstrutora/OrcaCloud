/**
 * Exportação IFC — `utils/blueprintIfc.ts`.
 *
 * O foco aqui é o CORPO da parede, e mais especificamente o CANTO.
 *
 * ─── O defeito que estes casos travam ───────────────────────────────────────
 *
 * Até 30/08/2026 a parede saía como `IFCRECTANGLEPROFILEDEF(wallLength, t)` —
 * EIXO A EIXO. Num canto em L isso deixa um entalhe de meia espessura na face
 * externa, e o entalhe viajava para o Revit junto com o arquivo. O usuário
 * fotografou o mesmo defeito na vista 3D da tela; o IFC tinha a cópia dele.
 *
 * A régua do avanço é `extensaoDeCanto`, do kernel — a MESMA da planta baixa e
 * da exportação em PDF. Ela NÃO é meia espessura fixa: isso só acerta em 90°.
 *
 * ─── Por que o CENTRO também é conferido ────────────────────────────────────
 *
 * `IFCRECTANGLEPROFILEDEF` é centrado. Esticar as duas pontas por valores
 * diferentes (canto de um lado, ponta livre do outro) move o centro do sólido:
 * ele deixa de ser o meio do eixo. Conferir só o comprimento deixaria passar
 * uma parede do tamanho certo na posição errada — pior que o defeito original.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  applyBatch,
  applyCommand,
  emptyModel,
  point,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';

const T = 150;
const H = 2800;

function comTerreo(): { model: BlueprintModel; terreoId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, terreoId: r.model.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm: H };
}

function ifcDe(model: BlueprintModel): string {
  return gerarIfc(model, {
    titulo: 'Estudo de teste',
    revisao: 1,
    hash: 'hash-fixo-para-guid-determinista',
    data: new Date('2026-08-30T12:00:00Z'),
  });
}

/** Comprimentos (o X do perfil) de todos os `IFCRECTANGLEPROFILEDEF` emitidos. */
function comprimentosDePerfil(ifc: string): number[] {
  const achados: number[] = [];
  for (const m of ifc.matchAll(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,\$,([-\d.]+),([-\d.]+)\)/g)) {
    achados.push(Number(m[1]));
  }
  return achados;
}

/**
 * Centro do sólido de UMA parede: o `IFCCARTESIANPOINT` 3D que o
 * `IFCAXIS2PLACEMENT3D` da parede referencia.
 *
 * O arquivo é um grafo de referências `#n`, então o caminho é: achar o perfil,
 * andar até o `IFCAXIS2PLACEMENT3D` que NÃO é o do perfil (o do perfil está na
 * origem) e resolver o ponto que ele aponta.
 */
function centrosDeParede(ifc: string): { x: number; y: number }[] {
  const pontos = new Map<string, { x: number; y: number }>();
  for (const m of ifc.matchAll(
    /^(#\d+)= IFCCARTESIANPOINT\(\(([-\d.]+),([-\d.]+),([-\d.]+)\)\);$/gm,
  )) {
    pontos.set(m[1], { x: Number(m[2]), y: Number(m[3]) });
  }

  const saida: { x: number; y: number }[] = [];
  for (const m of ifc.matchAll(/^#\d+= IFCAXIS2PLACEMENT3D\((#\d+),#\d+,(#\d+)\);$/gm)) {
    const p = pontos.get(m[1]);
    if (!p) continue;
    // O placement do PERFIL fica na origem e usa `dirX`; o da parede usa uma
    // `IFCDIRECTION` própria. Origem exata só existe no do perfil e no do
    // projeto/edifício — descartá-la deixa só as paredes com centro real.
    if (p.x === 0 && p.y === 0) continue;
    saida.push(p);
  }
  return saida;
}

describe('gerarIfc · canto da parede', () => {
  it('parede solta sai com o comprimento do eixo e centrada no meio dele', () => {
    const { model, terreoId } = comTerreo();
    const m = applyCommand(model, parede(terreoId, 1000, 2000, 5000, 2000)).model;

    const ifc = ifcDe(m);
    expect(comprimentosDePerfil(ifc)).toEqual([4000]);
    expect(centrosDeParede(ifc)).toContainEqual({ x: 3000, y: 2000 });
  });

  it('canto reto estica meia espessura em cada ponta esticada', () => {
    // Sala retangular 4000 × 3000 fora da origem: as quatro paredes têm as duas
    // pontas em canto, então cada uma cresce t/2 + t/2 = 150 mm, e o centro NÃO
    // se move (os dois avanços são iguais e se cancelam).
    const { model, terreoId } = comTerreo();
    const m = applyBatch(model, [
      parede(terreoId, 1000, 2000, 5000, 2000),
      parede(terreoId, 5000, 2000, 5000, 5000),
      parede(terreoId, 5000, 5000, 1000, 5000),
      parede(terreoId, 1000, 5000, 1000, 2000),
    ]).model;

    const ifc = ifcDe(m);
    expect(comprimentosDePerfil(ifc).sort((a, b) => a - b)).toEqual([3150, 3150, 4150, 4150]);
    expect(centrosDeParede(ifc)).toContainEqual({ x: 3000, y: 2000 });
  });

  it('junção assimétrica (um canto, uma ponta livre) desloca o centro', () => {
    // "L" de duas paredes: cada uma tem canto em UMA ponta só. O sólido cresce
    // 75 mm e o centro anda 37,5 mm na direção da ponta que cresceu.
    const { model, terreoId } = comTerreo();
    const m = applyBatch(model, [
      parede(terreoId, 1000, 2000, 5000, 2000),
      parede(terreoId, 5000, 2000, 5000, 5000),
    ]).model;

    const ifc = ifcDe(m);
    expect(comprimentosDePerfil(ifc).sort((a, b) => a - b)).toEqual([3075, 4075]);

    const centros = centrosDeParede(ifc);
    // Horizontal: cresceu na ponta B (+X), centro sai de 3000 para 3037,5.
    expect(centros).toContainEqual({ x: 3037.5, y: 2000 });
    // Vertical: cresceu na ponta A (−Y), centro sai de 3500 para 3462,5.
    expect(centros).toContainEqual({ x: 5000, y: 3462.5 });
  });

  it('parede do pavimento de cima no mesmo vértice não estica a de baixo', () => {
    const { model, terreoId } = comTerreo();
    const comSuperior = applyCommand(model, {
      type: 'AddLevel',
      name: 'Pavimento 1',
      elevationMm: H,
      defaultHeightMm: H,
    });
    const superiorId = comSuperior.model.levels[1].id;

    const m = applyBatch(comSuperior.model, [
      parede(terreoId, 1000, 2000, 5000, 2000),
      parede(superiorId, 5000, 2000, 5000, 5000),
    ]).model;

    // Em planta as duas se tocam; no espaço não. Nenhuma estica.
    expect(comprimentosDePerfil(ifcDe(m)).sort((a, b) => a - b)).toEqual([3000, 4000]);
  });
});
